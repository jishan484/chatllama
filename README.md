# ChatLLaMA <img width="31" height="33" alt="image" src="https://github.com/user-attachments/assets/94da76b2-eb2d-41c4-a9fe-2d8f23070482" />

> <img width="574" height="268" alt="image" src="https://github.com/user-attachments/assets/60fb7751-f3c4-4661-87cb-e056eaa02349" />

*UI and local proxy for Ollama — chat with LLaMA and other models from any device on your network.*

ChatLLaMA is a lightweight web interface and proxy server that allows you to chat with Ollama models running on your host machine — from mobile, tablet, or other computers. It exposes a simple UI and REST endpoint so you don’t have to stay on the same PC.

## ✨ Features
- 🔄 Model Selector – switch between installed models (e.g. llama3, mistral, gemma, etc.)
- 💬 Chat Interface – stream responses from models in real-time
- 🌈 Output Highlighting – style model responses for readability
- 🧠 Code Highlighting – syntax-aware blocks for code in model replies
- 📋 Copy Code Button – quickly copy code snippets with one click
- ⚡ Keyboard Shortcuts – navigate UI and send messages efficiently
- 🧩 Proxy API – exposes Ollama's /api/chat endpoint over your LAN
- 📝 Chat History – persist chat sessions for seamless follow-up conversations

## 🚀 Getting Started
- Required `pyton3` (no external dependency required)
- Ollama installed and running on your host
- Models pulled via ollama pull llama3 (or other)
1. Run `python3 host.py`
2. Then open in browser: <br>
📱 `http://<host-ip>:8000` (accessible from mobile or other devices on same/any network)

⚙️ Configuration
- You need to modify host.py to change the port

## 🎨 UI
- Resizable input box with multiline support
- Keyboard shortcuts:
  * Enter to send
  * Ctrl+D to start New Chat
  * Ctrl+S: Stop output
- Automatic scroll to latest response
- Persistent chat history

##  🔐 Security Notes
This app exposes your Ollama instance to the network.
To restrict access:
- Use firewall/IP filtering
- Add authentication (coming soon)

## 🛠️ TODO / Roadmap
 * Multi-user sessions
 * Auth layer for public deployment
 * Prompt presets
 * Voice input & output
 * Mobile PWA install

# 🧠 Why?
Ollama is powerful — but it's limited to your local machine 😭.
ChatLLaMA lets you access local models like llama3 from any device on your network 🤩, with a lightweight and user-friendly web interface.
No need to install heavy apps or frameworks — just run this simple web app and start chatting. 😎

## 📄 License
MIT License — feel free to fork, contribute, and make it better!
