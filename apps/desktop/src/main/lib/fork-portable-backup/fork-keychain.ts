import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { BackupManifest } from "./fork-types";

type Item = BackupManifest["keychain"][number];
const SCRIPT = `ObjC.import("Foundation"); ObjC.import("Security");
var input = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding($.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile, $.NSUTF8StringEncoding)));
function read(service, account) {
  var query = {class:"genp", svce:service, r_Attributes:true, m_Limit:"m_LimitAll"};
  if (account !== null) query.acct = account;
  var result = Ref(); var status = Number($.SecItemCopyMatching($(query), result));
  if (status === -25300) return [];
  if (status !== 0) throw Error("keychain_read_" + status);
  var array = ObjC.castRefToObject(result[0]), rows = [];
  for (var i = 0; i < Number(array.count); i++) {
    var item = array.objectAtIndex(i);
    var serviceName = ObjC.unwrap(item.objectForKey($("svce"))), accountName = ObjC.unwrap(item.objectForKey($("acct")));
    var secret = Ref(); var secretStatus = Number($.SecItemCopyMatching($({class:"genp",svce:serviceName,acct:accountName,r_Data:true}),secret));
    if (secretStatus !== 0) throw Error("keychain_read_" + secretStatus);
    rows.push({service:serviceName,account:accountName,data:ObjC.unwrap(ObjC.castRefToObject(secret[0]).base64EncodedStringWithOptions(0))});
  }
  return rows;
}
function run() {
  if (input.action === "read") return JSON.stringify(input.services.reduce(function(all, service) { return all.concat(read(service, null)); }, []));
  input.items.forEach(function(item) {
    var query = {class:"genp", svce:item.service, acct:item.account};
    var status;
    if (item.data === null) { status = Number($.SecItemDelete($(query))); if (status === -25300) status = 0; }
    else {
      var data = $.NSData.alloc.initWithBase64EncodedStringOptions($(item.data), 0);
      status = Number($.SecItemUpdate($(query), $({"v_Data":data})));
      if (status === -25300) { query.v_Data = data; status = Number($.SecItemAdd($(query), null)); }
    }
    if (status !== 0) throw Error("keychain_write_" + status);
  });
  return "[]";
}`;

async function call(input: unknown): Promise<Item[]> {
	if (process.platform !== "darwin") return [];
	return new Promise((resolve, reject) => {
		const child = spawn(
			"/usr/bin/osascript",
			["-l", "JavaScript", "-e", SCRIPT],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		let output = "";
		let failure = "";
		child.stdout.on("data", (chunk) => {
			output += String(chunk);
			if (output.length > 4 * 1024 * 1024) child.kill();
		});
		child.stderr.on("data", (chunk) => {
			failure += String(chunk);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(
					new Error(
						`backup_keychain_failed: ${failure.replace(/[^a-zA-Z0-9_ -]/g, "").slice(-160)}`,
					),
				);
				return;
			}
			try {
				resolve(JSON.parse(output.trim()) as Item[]);
			} catch {
				reject(new Error("backup_keychain_invalid_response"));
			}
		});
		child.stdin.on("error", reject);
		child.stdin.end(JSON.stringify(input));
	});
}

export function keychainServices(manifest: BackupManifest) {
	const services = new Set([
		"Claude Code-credentials",
		"cursor-access-token",
		"gemini",
		"Superset++ Safe Storage",
		"Paradev++ Safe Storage",
		"gh:github.com",
	]);
	for (const path of [
		...manifest.roots.flatMap((root) => [root.path, ...root.aliases]),
		...Object.keys(manifest.aliases),
	]) {
		for (const variant of [
			path,
			`${path}/`,
			path.replace(manifest.home, "~"),
			path.replace(manifest.home, "$HOME"),
		])
			services.add(
				`Claude Code-credentials-${createHash("sha256").update(variant.normalize("NFC")).digest("hex").slice(0, 8)}`,
			);
	}
	return [...services];
}

export async function readKeychain(services: string[]) {
	return call({ action: "read", services });
}
export async function writeKeychain(
	items: (Omit<Item, "data"> & { data: string | null })[],
) {
	await call({ action: "write", items });
}

export function remapKeychain(
	manifest: BackupManifest,
	map: (value: string) => string,
	targetHome: string,
): Item[] {
	const services = new Map<string, string>();
	for (const path of [
		...manifest.roots.flatMap((root) => [root.path, ...root.aliases]),
		...Object.keys(manifest.aliases),
	]) {
		for (const variant of [
			path,
			`${path}/`,
			path.replace(manifest.home, "~"),
			path.replace(manifest.home, "$HOME"),
		]) {
			const next = variant.startsWith("/") ? map(variant) : variant;
			const service = (value: string) =>
				`Claude Code-credentials-${createHash("sha256").update(value.normalize("NFC")).digest("hex").slice(0, 8)}`;
			services.set(service(variant), service(next));
		}
	}
	return manifest.keychain.map((item) => ({
		...item,
		service: services.get(item.service) ?? item.service,
		account:
			item.service.startsWith("Claude Code-credentials") &&
			item.account === basename(manifest.home)
				? basename(targetHome)
				: item.account,
	}));
}
