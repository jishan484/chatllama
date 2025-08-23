class DOMBuilder {
    constructor(root) {
        this.stack = [root];
        this.currentElem = root;
    }

    create(type, className = null) {
        const el = document.createElement(type);
        if (className) el.className = className;
        this.currentElem.appendChild(el);
        this.stack.push(el);
        this.currentElem = el;
    }

    createSingle(type, className = null) {
        const el = document.createElement(type);
        if (className) el.className = className;
        this.currentElem.appendChild(el);
    }

    close() {
        if (this.stack.length > 1) {
            this.stack.pop();
            this.currentElem = this.stack[this.stack.length - 1];
        }
    }

    innerText(str) {
        if (this.currentElem.lastChild?.nodeType === Node.TEXT_NODE) {
            this.currentElem.lastChild.textContent += str;
        } else {
            this.currentElem.appendChild(document.createTextNode(str));
        }
    }

    tempText(str) {
        // TEMP BUFFER: stores partial streaming text
        if (this.currentElem.querySelector('temp')) {
            this.currentElem.querySelector('temp').textContent += str;
        } else {
            this.currentElem.appendChild(document.createElement("temp"));
            this.currentElem.querySelector('temp').textContent += str;
        }
    }

    reset() {
        // clear any temp buffer
        this.currentElem.querySelectorAll('temp').forEach(temp => temp.remove());
    }
}

class StreamingMarked {
    constructor(rootElement) {
        this.builder = new DOMBuilder(rootElement);
        this.lineBuffer = "";
        this.currentList = null;
        this.inCodeBlock = false;
        this.codeBlockLang = null;
        this.currentTable = null;
    }

    parse(chunk) {
        for (let i = 0; i < chunk.length; i++) {
            const ch = chunk[i];
            if (ch === '\n') {
                this.builder.reset();
                this._processLine(this.lineBuffer);
                this.lineBuffer = "";
            } else {
                this.lineBuffer += ch;
                if (!this.inCodeBlock) this.builder.tempText(ch);
            }
        }
    }

    flush() {
        this.builder.reset();
        if (this.lineBuffer.trim().length) {
            this._processLine(this.lineBuffer);
            this.lineBuffer = "";
        }
        if (this.currentList) { this.builder.close(); this.currentList = null; }
        if (this.inCodeBlock) { this.builder.close(); if (hljs) hljs.highlightElement(this.builder.stack.at(-1)); this.builder.close(); this.inCodeBlock = false; this.codeBlockLang = null; }
        if (this.currentTable) { this.builder.close(); this.currentTable = null; }
    }

    _processLine(line) {
        const trimmed = line.trim();
        let spaces = 0;
        while(line.charAt(spaces) == ' ' && spaces < line.length) spaces++;
        if (!trimmed) {
            if (this.currentList) { this.builder.close(); this.currentList = null; }
            if (this.inCodeBlock) { this.builder.innerText("\n"); }
            else { this.builder.createSingle("br"); }
            return;
        }

        // --- Code Block ---
        if (trimmed.startsWith("```")) {
            if (this.inCodeBlock) {
                if (hljs) hljs.highlightElement(this.builder.stack.at(-1));
                this.builder.close(); this.builder.close();
                this.inCodeBlock = false; this.codeBlockLang = null;
            } else {
                this.inCodeBlock = true;
                this.codeBlockLang = trimmed.slice(3).trim() || "sh";
                this.builder.create("pre");
                this.builder.create("code");
                this.builder.stack.at(-1).className = `hljs language-${this.codeBlockLang}`;
            }
            return;
        }

        if (this.inCodeBlock) {
            this.builder.innerText(line + "\n");
            return;
        }

        // --- Header ---
        const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            this.builder.create(`h${level}`, `text-pink-${800 - (level * 100)}`);
            this._processInline(headerMatch[2]);
            this.builder.close();
            return;
        }

        // --- Lists ---
        if (/^[-*+]\s+/.test(trimmed)) {
            if (this.currentList !== "ul" && spaces >= 2) { 
                if (this.currentList) this.builder.close(); 
                this.builder.create("ul", "list-none pl-6 space-y-2 text-blue-300"); 
                this.currentList = "ul"; 
            }
            if (this.currentList !== "ul" && spaces >= 2) this.builder.create("li", "before:content-['>'] before:mr-2 before:text-pink-500");
            else this.builder.create("li")
            this._processInline(trimmed.replace(/^[-*+]\s+/, ""));
            this.builder.close();
            return;
        }

        const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (olMatch) {
            if (this.currentList !== "ol") { if (this.currentList) this.builder.close(); this.builder.create("ol", "list-decimal pl-6 space-y-2 text-teal-400"); this.currentList = "ol"; }
            this.builder.create("li");
            this._processInline(olMatch[2]);
            this.builder.close();
            return;
        }

        if (/^---+$/.test(trimmed)) { this.builder.createSingle("hr"); return; }

        // --- Table ---
        if (trimmed.startsWith("|")) {
            if (!this.currentTable) {
                this.builder.create("table", "table-auto border-collapse w-full my-2");
                this.builder.create("thead", "bg-gray-600");
                this.builder.create("tr");
                trimmed.split("|").map(c => c.trim()).filter(c => c.length > 0).forEach(h => {
                    this.builder.create("th", "border px-4 py-2 text-left font-bold");
                    this._processInline(h);
                    this.builder.close();
                });
                this.builder.close(); this.builder.close();
                this.builder.create("tbody");
                this.currentTable = true;
                return;
            } else {
                this.builder.create("tr");
                trimmed.split("|").map(c => c.trim()).filter(c => !c.includes("----") && c.length > 0).forEach(c => {
                    this.builder.create("td", "border px-4 py-2");
                    this._processInline(c);
                    this.builder.close();
                });
                console.log(this.builder.stack.at(-1))
                this.builder.close(); // tr
                return;
            }
        } else if (this.currentTable) {
            this.builder.close(); this.builder.close(); this.currentTable = null;
        }

        // --- <think> ---
        if (trimmed.startsWith("<think>")) { this.builder.create("think"); this.builder.innerText(trimmed.replace(/<.?think>/ig, "")); return; }
        if (trimmed.startsWith("</think>")) { this.builder.innerText(trimmed.replace(/<.?think>/ig, "")); this.builder.close(); return; }

        // --- Blockquote ---
        if (trimmed.startsWith(">")) {
            let level = 0;
            let rest = trimmed;
            while (rest.startsWith(">")) {
                level++;
                rest = rest.slice(1).trimStart();
            }
            for (let i = 0; i < level; i++) {
                this.builder.create("blockquote", "border-l-4 border-gray-400 pl-4 ml-2 italic text-gray-500");
            }
            this._processInline(rest);
            for (let i = 0; i < level; i++) {
                this.builder.close();
            }
            return;
        }


        // Close list if open
        if (this.currentList) { this.builder.close(); this.currentList = null; }

        // --- Paragraph ---
        this.builder.create("p");
        this._processInline(trimmed);
        this.builder.close();
    }

    _processInline(text) {
        let i = 0;
        while (i < text.length) {
            if (text.startsWith("**", i)) {
                let end = text.indexOf("**", i + 2); if (end !== -1) { this.builder.create("strong"); this._processInline(text.slice(i + 2, end)); this.builder.close(); i = end + 2; continue; }
            }
            if (text.startsWith("_", i)) {
                let end = text.indexOf("_", i + 1); if (end !== -1) { this.builder.create("em"); this.builder.innerText(text.slice(i + 1, end)); this.builder.close(); i = end + 1; continue; }
            }
            if (text.startsWith("`", i)) {
                let end = text.indexOf("`", i + 1); if (end !== -1) { this.builder.create("codeblock"); this.builder.innerText(text.slice(i + 1, end)); this.builder.close(); i = end + 1; continue; }
            }
            if (text.startsWith("~~", i)) {
                let end = text.indexOf("~~", i + 2); if (end !== -1) { this.builder.create("del"); this.builder.innerText(text.slice(i + 2, end)); this.builder.close(); i = end + 2; continue; }
            }
            this.builder.innerText(text[i]); i++;
        }
    }
}
