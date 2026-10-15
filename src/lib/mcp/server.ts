import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStoryOpening, listStories, recommendStories } from "@/lib/mcp/catalog";

const SERVER_VERSION = "1.0.0";

const hskLevel = z
  .union([z.number().int().min(1).max(9), z.string().trim().regex(/^(?:HSK\s*)?[1-9]$/i)])
  .describe('HSK band for Chinese stories. Use an integer 1-9 or a string like "HSK 4". Does not apply to English CEFR stories.');

const targetLanguage = z
  .enum(["zh", "en"])
  .describe("Learning language: zh for Chinese stories, en for English stories.");

const genre = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .describe("Genre or keyword, such as mystery, romance, xianxia, comedy, or science fiction. Case-insensitive.");

/**
 * Fresh server per request. Stateless Streamable HTTP cannot reuse one transport.
 */
export function createInkquestMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "inkquest",
      title: "InkQuest",
      version: SERVER_VERSION,
      websiteUrl: "https://inkquest.dev",
    },
    {
      instructions:
        "Read-only catalog of free InkQuest interactive stories for learning Chinese (HSK) and English (CEFR). Tools return public story cards, the free opening scene (with pinyin or pronunciation and glosses when the catalog has them), and https://inkquest.dev/stories/{id} links. They never return subscriber-only scenes or user-generated stories. To keep reading, open the story URL.",
      maxToolInputElements: 32,
    },
  );

  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;

  server.registerTool(
    "list_stories",
    {
      title: "List public stories",
      description:
        "List free, public InkQuest stories. Each card has the title, level (HSK for Chinese, CEFR for English), genre, a short description, and the public reading URL https://inkquest.dev/stories/{id}. Optional filters: target_language (zh or en), hsk_level (Chinese stories only), and genre. Does not include subscriber-only scenes, withdrawn demos, or user-generated stories.",
      inputSchema: {
        target_language: targetLanguage.optional(),
        hsk_level: hskLevel.optional(),
        genre: genre.optional(),
      },
      annotations: readOnly,
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(listStories(args), null, 2) }],
    }),
  );

  server.registerTool(
    "get_story_opening",
    {
      title: "Get the free opening",
      description:
        "Return the free opening scene of one public InkQuest story: plain text, pinyin or pronunciation and short glosses when the catalog has them, and the opening choices. Premium choices are labeled and their following scenes are omitted. Always includes the https://inkquest.dev/stories/{id} URL where the reader continues. Refuses unknown ids, withdrawn demos, locked stories, and user-generated stories. Never returns subscriber-only scene text.",
      inputSchema: {
        story_id: z
          .string()
          .trim()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(80)
          .describe("Public catalog id from list_stories, such as before-the-rain-stops."),
      },
      annotations: readOnly,
    },
    async ({ story_id }) => {
      const result = await getStoryOpening(story_id);
      if (!result.ok) {
        return { isError: true, content: [{ type: "text", text: result.error }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(result.opening, null, 2) }] };
    },
  );

  server.registerTool(
    "recommend_story",
    {
      title: "Recommend a public story",
      description:
        "Recommend up to three public InkQuest stories. Pass hsk_level (1-9 or \"HSK 4\") to rank Chinese stories by closeness to that band. Optional genre or interests (keywords such as mystery, romance, xianxia, sci-fi) boost matches. Optional target_language is zh or en. Each match includes a short reason and a https://inkquest.dev/stories/{id} link. Only free catalog stories are considered; subscriber-only scenes and user-generated stories are excluded.",
      inputSchema: {
        hsk_level: hskLevel.optional(),
        target_language: targetLanguage.optional(),
        genre: genre.optional(),
        interests: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .optional()
          .describe("Free-text interests, such as \"mystery, rainy city\" or \"sci-fi\". Combined with genre."),
      },
      annotations: readOnly,
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(recommendStories(args), null, 2) }],
    }),
  );

  return server;
}
