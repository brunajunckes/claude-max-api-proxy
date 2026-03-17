# Claude Max API Proxy

**Turn your $200/month Claude Max subscription into a full API -- no extra cost.**

---

## What Is This? (Plain English)

Imagine you're paying $200/month for Claude Max (Anthropic's premium AI plan). You can chat with Claude on their website, and you can use the Claude Code CLI in your terminal. But what if you want to use Claude in *other* apps -- like [OpenClaw](https://openclaw.ai), coding assistants, or your own scripts?

Normally, you'd have to pay *again* for API access (which charges per message). That's expensive.

**This project is a bridge.** It takes your existing Claude Max subscription and makes it look like a standard API that other apps can talk to. You run a tiny server on your computer, and any app that speaks the "OpenAI format" (which is basically the universal language for AI apps) can connect to it.

**The result:** You use your Claude Max subscription everywhere, and you don't pay a single extra cent.

---

## Why Would I Want This?

- **You already pay for Claude Max** ($200/month) and want to get more out of it
- **You use OpenClaw** or other AI tools that need an API endpoint
- **You're a developer** who wants to use Claude in scripts, apps, or workflows without per-message API costs
- **You want one subscription to rule them all** instead of paying for multiple AI services

### How Much Money Does This Save?

| Scenario | Without This Proxy | With This Proxy |
|----------|-------------------|-----------------|
| 1M input tokens/month | ~$15 API cost | $0 (you already paid for Max) |
| 500K output tokens/month | ~$37.50 API cost | $0 |
| **Typical monthly savings** | **~$50+** | **Included in your Max sub** |

---

## Before You Start (Prerequisites)

You need three things. If you don't have them yet, don't worry -- here's how to get each one:

### 1. A Claude Max Subscription

This is the $200/month plan from Anthropic. If you don't have it, sign up at [claude.ai](https://claude.ai).

### 2. Node.js (version 20 or newer)

Node.js is what runs JavaScript code outside of a web browser. Think of it as the engine that powers this proxy.

**Check if you already have it:**
```bash
node --version
```

If you see something like `v20.x.x` or higher, you're good. If not:

- **Mac:** Open Terminal and run `brew install node` (if you have Homebrew), or download from [nodejs.org](https://nodejs.org)
- **Windows:** Download from [nodejs.org](https://nodejs.org) and run the installer
- **Linux:** `sudo apt install nodejs npm` (Ubuntu/Debian) or `sudo dnf install nodejs` (Fedora)

### 3. Claude Code CLI (Installed and Logged In)

The Claude Code CLI is a command-line tool from Anthropic. This proxy uses it behind the scenes to talk to Claude.

**Install it:**
```bash
npm install -g @anthropic-ai/claude-code
```

(`npm install -g` means "install this tool globally so I can use it from anywhere")

**Log in to your Claude account:**
```bash
claude auth login
```

This will open a browser window where you sign in with your Claude Max account. Once you're signed in, the CLI stores your credentials securely in your system keychain.

**Verify it worked:**
```bash
claude --version
```

You should see a version number. If you do, you're all set.

---

## Setup (Step by Step)

### Step 1: Download This Project

Open your terminal (Terminal on Mac, Command Prompt or PowerShell on Windows) and run:

```bash
git clone https://github.com/mattschwen/claude-max-api-proxy.git
cd claude-max-api-proxy
```

**What just happened?** You downloaded a copy of this project to your computer and moved into its folder.

### Step 2: Install Dependencies

```bash
npm install
```

**What just happened?** This downloaded all the additional code libraries that this project needs to run (things like the Express web server). They're stored in a `node_modules` folder.

### Step 3: Start the Proxy Server

```bash
npm start
```

**What just happened?** You started a small web server on your computer. It's now listening on `http://localhost:3456` (that's "your own computer, port 3456"). Any app that connects to this address will be able to talk to Claude through your Max subscription.

You should see output indicating the server is running. **Keep this terminal window open** -- the server stops when you close it.

---

## Test That It's Working

Open a **new** terminal window (keep the server running in the first one) and try these commands:

### Health Check (Is the server alive?)

```bash
curl http://localhost:3456/health
```

You should see a JSON response confirming the server is healthy.

(`curl` is a built-in command that sends a web request. Think of it like visiting a URL, but from the terminal.)

### List Available Models

```bash
curl http://localhost:3456/v1/models
```

You should see a list of Claude models (Opus, Sonnet, Haiku).

### Send a Message to Claude

```bash
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "Say hello in three languages"}]
  }'
```

**What just happened?** You sent a message to Claude through the proxy, and got back a response. This is the exact same format that OpenAI's API uses, which means any app designed for OpenAI can use this proxy instead.

### Try Streaming (Real-Time Responses)

```bash
curl -N -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "Tell me a joke"}],
    "stream": true
  }'
```

(`-N` tells curl not to buffer the output, so you see words appear in real time.)

---

## Connect Your Apps

Now that the proxy is running, point your favorite apps at it.

### OpenClaw

In OpenClaw's settings, set the API endpoint to:

- **API Base URL:** `http://localhost:3456/v1`
- **API Key:** `not-needed` (type literally anything -- the proxy doesn't check it)
- **Model:** `claude-opus-4`, `claude-sonnet-4`, or `claude-haiku-4`

### Continue.dev (VS Code AI Extension)

Add this to your Continue config file:

```json
{
  "models": [{
    "title": "Claude (Max)",
    "provider": "openai",
    "model": "claude-sonnet-4",
    "apiBase": "http://localhost:3456/v1",
    "apiKey": "not-needed"
  }]
}
```

### Python (OpenAI Library)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3456/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="claude-sonnet-4",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)
```

### Any OpenAI-Compatible App

The magic of this proxy is that it speaks "OpenAI format." So any app that lets you set a custom OpenAI endpoint can use it:

- **API Base URL:** `http://localhost:3456/v1`
- **API Key:** Any string (the proxy ignores it)
- **Model:** `claude-opus-4`, `claude-sonnet-4`, or `claude-haiku-4`

---

## Available Models

| Model ID | What It Is | Best For |
|----------|-----------|----------|
| `claude-opus-4` | Most capable, smartest | Complex reasoning, analysis, coding |
| `claude-sonnet-4` | Great balance of speed and smarts | General use, most tasks |
| `claude-haiku-4` | Fastest, lightest | Quick questions, simple tasks |

---

## API Reference

| Endpoint | Method | What It Does |
|----------|--------|-------------|
| `/health` | GET | Check if the server is running |
| `/v1/models` | GET | List available Claude models |
| `/v1/chat/completions` | POST | Send messages and get responses |

---

## Run Automatically on Mac (Optional)

Tired of manually starting the server every time? You can make it start automatically when you log in. See [docs/macos-setup.md](docs/macos-setup.md) for instructions.

---

## How It Works (Under the Hood)

```
Your App (OpenClaw, Continue.dev, Python script, etc.)
         |
         v
    HTTP Request (OpenAI format)
         |
         v
   This Proxy (running on your computer)
         |
         v
   Claude Code CLI (the official command-line tool)
         |
         v
   Your Claude Max subscription (via OAuth)
         |
         v
   Claude's brain (Anthropic's servers)
         |
         v
   Response flows back up the chain to your app
```

Anthropic blocks third-party apps from directly using your Max subscription's OAuth tokens. But the Claude Code CLI *is* allowed to use them. This proxy bridges that gap: your app talks to the proxy, the proxy talks to the CLI, and the CLI talks to Anthropic.

---

## Troubleshooting

### "I ran `npm start` but nothing happened"

Make sure you're in the right folder:
```bash
cd claude-max-api-proxy
npm start
```

### "Claude CLI not found" error

The Claude Code CLI isn't installed or isn't in your system's PATH. Fix it:
```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

Then verify:
```bash
which claude
```

If `which claude` shows nothing, you may need to restart your terminal or add npm's global bin directory to your PATH.

### "curl: command not found"

- **Mac/Linux:** `curl` should be pre-installed. If not, install it with your package manager.
- **Windows:** Use PowerShell instead, or install curl from [curl.se](https://curl.se).

### Streaming gives no output

Make sure you're using the `-N` flag with curl:
```bash
curl -N -X POST http://localhost:3456/v1/chat/completions ...
```

The `-N` flag disables buffering, which is required for streaming to work properly.

### The server crashes or won't start

1. Check that Node.js 20+ is installed: `node --version`
2. Check that dependencies are installed: `npm install`
3. Check that Claude CLI works on its own: `claude "hello"`

### Port 3456 is already in use

Something else is using that port. Either stop the other process or start the proxy on a different port (check the source code for configuration options).

---

## Security Notes

- **No API keys are stored by this proxy.** Authentication is handled entirely by the Claude CLI's secure keychain storage.
- **The proxy only listens on localhost** (your computer only). No one else on your network can access it unless you change the configuration.
- **Commands are executed safely** using Node.js `spawn()` (not shell execution), which prevents injection attacks.

---

## Contributing

Want to help improve this project? See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## License

MIT -- see [LICENSE](LICENSE) for details.

Originally based on work by Atal Ashutosh. Maintained by Matt Schwen.
