export interface BackupRoot {
	id: string;
	path: string;
	aliases: string[];
	kind: "app" | "desktop" | "repository" | "agent" | "linked";
	bytes: number;
	files: number;
}

export interface BackupManifest {
	version: 1;
	appVersion: string;
	platform: string;
	createdAt: string;
	home: string;
	appHome: string;
	userData: string;
	roots: BackupRoot[];
	missing: string[];
	cwds: string[];
	aliases: Record<string, string>;
	repositories: string[];
	machineId: string;
	hostId: string;
	storage: Record<string, string>;
	keychain: { service: string; account: string; data: string }[];
}

export interface BackupEnvironment {
	agentHomes?: string[];
	home: string;
	appHome: string;
	userData: string;
	appVersion: string;
	machineId: string;
	hostId: string;
}

export interface BackupProgress {
	phase: "scan" | "write" | "read" | "restore";
	files: number;
	bytes: number;
}

export type Progress = (progress: BackupProgress) => void;

export interface RootMapping {
	id: string;
	target: string;
}
