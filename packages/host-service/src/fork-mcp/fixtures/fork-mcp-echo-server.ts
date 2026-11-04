import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "echo", version: "1" });
for (const name of ["echo", "time"])
	server.registerTool(name, { description: `The ${name} tool` }, async () => ({
		content: [{ type: "text", text: name }],
	}));
await server.connect(new StdioServerTransport());
