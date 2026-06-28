# 🔮 WICKED

**One window. Every model. One memory.**

A cross-platform desktop chat app and persistent AI memory system. Talk to **OpenAI**, **Google Gemini**, and **DeepSeek** with full streaming, image paste/upload, image generation, sidebar folders, chat linking, and a **Master Brain** — an Obsidian-compatible markdown vault that every model reads from and writes to, so each session builds on everything before it.

---

## Features

- **Three providers, one UI** — OpenAI, Gemini, DeepSeek with per-chat model selection and streaming.
- **Master Brain** — an Obsidian-compatible `WickedBrain/` vault of markdown notes. Relevant notes are auto-injected as context before each send (keyword + optional semantic search). End a chat and the model summarizes it into a categorized note.
- **💡 Ideas capture** — future-project ideas are detected and saved to a dedicated `Ideas/` section.
- **Sidebar organization** — uncategorized chats up top, user folders below, rename/move/delete, export.
- **Chat linking** — pull other conversations' history in as context.
- **Image generation** — Gemini Imagen 3.
- **Export** — Markdown or PDF.
- **MCP tool use** — connect MCP servers (e.g. a Godot editor server) so OpenAI/DeepSeek can call real tools. See below.
- **Built-in updater** — a "Check for updates" button compares your version against the latest GitHub release.

## Tech stack

Electron + React 18 + TypeScript + Tailwind + Zustand, SQLite (`better-sqlite3`) in the main process, Vite build via `vite-plugin-electron`, packaged with `electron-builder`.

## Development

```bash
npm install      # installs deps + rebuilds better-sqlite3 for Electron
npm run dev      # launch the app in dev with HMR
npm run build    # typecheck + production build (renderer + main + preload)
npm run dist     # build installers via electron-builder (per-OS)
```

> In a headless/CI environment the Electron **binary** download can be skipped with
> `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install`. You still get a full typecheck/build;
> you just can't launch the GUI there.

First launch: open **Settings ⚙️**, add your API keys, and pick a **vault folder** to enable the Master Brain.

## MCP servers — connecting DeepSeek to your Godot editor

WICKED can act as an **MCP client**. Any MCP server you add in **Settings → MCP Servers** has its
tools exposed to OpenAI and DeepSeek through function-calling. When the model decides to use a tool,
WICKED runs it via the MCP server and feeds the result back — so the model can read and edit your
Godot project while you chat.

To wire up a Godot editor server:

1. Install/locate a Godot MCP server (a stdio MCP server that talks to the Godot editor).
2. In **Settings → MCP Servers → + Add MCP server**, set:
   - **Name**: `Godot`
   - **Command**: the launcher, e.g. `npx` (or an absolute path to the binary)
   - **Args**: e.g. `-y godot-mcp` (whatever the server's docs specify)
3. Click **Test** to confirm WICKED can connect and list its tools.
4. Select **DeepSeek** in the model bar and start chatting — the model will call the Godot tools as needed.

> Tool-calling currently runs through the OpenAI and DeepSeek providers (OpenAI-compatible
> function-calling). When MCP tools are active for a chat, that turn is resolved via the
> tool loop rather than token streaming.

## Releases & auto-update

`npm run dist` produces installers (`.dmg` / `.nsis` / `.AppImage`) and `electron-builder` is
configured to publish to GitHub Releases (`trendlinepros-afk/desktop-ai-chat-app`). The in-app
**Check for updates** button (bottom of the window) reads the latest release tag from GitHub and
tells you whether a newer version is available, linking to the download.

## Project layout

```
electron/   main process — main.ts, preload.ts, db.ts (SQLite), vault.ts (Obsidian vault), mcp.ts
src/        React renderer — components/, store/ (Zustand), hooks/, types/
```
