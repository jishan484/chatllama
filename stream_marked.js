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
        this.previousSpace = 0;
        this.indentationStack = [];
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
        if (this.inCodeBlock) { if (hljs) hljs.highlightElement(this.builder.stack.at(-1)); this.builder.close(); this.builder.close(); this.inCodeBlock = false; this.codeBlockLang = null; }
        if (this.currentTable) { this.builder.close(); this.currentTable = null; }
    }

    _processLine(line) {
        const trimmed = line.trim();
        let spaces = 0;
        while (line.charAt(spaces) == ' ' && spaces < line.length) spaces++;
        if (!trimmed) {
            if (this.currentList) { this.builder.close(); this.currentList = null; }
            if (this.inCodeBlock) { this.builder.innerText("\n"); }
            else { this.builder.createSingle("br"); }
            return;
        }

        // --- Table ---
        if (trimmed.startsWith("|")) {
            const cells = trimmed.split("|").map(c => c.trim());
            // --- First header row ---
            if (!this.currentTable) {
                this.builder.create("table", "table-fixed border-collapse w-full my-2");
                this.builder.create("thead", "bg-gray-600");
                this.builder.create("tr");
                cells.pop();
                cells.pop();
                cells.forEach(h => {
                    this.builder.create("th", "border px-4 py-2 text-left font-bold");
                    this._processInline(h);
                    this.builder.close(); // th
                });
                this.builder.close(); // tr
                this.builder.close(); // thead
                this.builder.create("tbody");
                this.currentTable = "header-done"; // mark state
                return;
            }
            // --- Divider row (skip entirely) ---
            if (this.currentTable === "header-done" && cells.some(c => /^-+$/.test(c))) {
                this.currentTable = "body"; // switch state
                return; // do not render anything
            }
            // --- Body rows ---
            if (this.currentTable) {
                this.builder.create("tr");

                cells.filter(c => c.length > 0).forEach(c => {
                    this.builder.create("td", "border px-4 py-2");
                    this._processInline(c);
                    this.builder.close(); // td
                });

                this.builder.close(); // tr
                return;
            }
        } else if (this.currentTable) {
            // End table when line does not start with "|"
            this.builder.close(); // tbody
            this.builder.close(); // table
            this.currentTable = null;
        }


        // --- Code Block ---
        if (trimmed.startsWith("```")) {
            if (this.inCodeBlock) {
                if (hljs) hljs.highlightElement(this.builder.stack.at(-1));
                this.builder.close(); this.builder.close();
                this.inCodeBlock = false; this.codeBlockLang = null;
                if (trimmed.slice(3).trim().length > 1) {
                    this.inCodeBlock = true;
                    this.codeBlockLang = trimmed.slice(3).trim() || "sh";
                    this.builder.create("pre");
                    this.builder.create("code");
                    this.builder.stack.at(-1).className = `hljs language-${this.codeBlockLang}`;
                }
            } else {
                //close all previous
                this._reset();
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
            this.builder.create(`h${level}`, `text-pink-${100 + (((level <= 4) ? level : 4) * 100)}`);
            this._processInline(headerMatch[2]);
            this.builder.close();
            return;
        }

        // --- Lists ---
        // Handle unordered list
        if (/^[-*+]\s+/.test(trimmed)) {
            const content = trimmed.replace(/^[-*+]\s+/, "");
            while (this.previousSpace > spaces) {
                this.builder.close(); // closes <li>
                this.previousSpace -= this.indentationStack.pop(); // adjust nesting level step
            }
            if (this.currentList !== "ul" || this.previousSpace < spaces) {
                if (this.currentList && this.previousSpace >= spaces) {
                    this.builder.close(); // close last <li> before new UL
                }
                this.builder.create("ul", "list-none pl-6 text-gray-400");
                this.currentList = "ul";
            }
            if (spaces >= 2) {
                this.builder.create(
                    "li",
                    "before:content-['⨠'] before:mr-2"
                );
            } else {
                this.builder.create("li");
            }
            this._processInline(content);
            this.builder.close(); // close li
            if (this.previousSpace < spaces) this.indentationStack.push(spaces - this.previousSpace)
            this.previousSpace = spaces;
            return;
        }

        // Handle ordered list
        const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (olMatch) {
            const content = olMatch[2];
            // Close previous lists if indentation decreased
            while (this.previousSpace > spaces) {
                this.builder.close(); // close <li>
                this.previousSpace -= this.indentationStack.pop();
            }
            // If new OL needed
            if (this.currentList !== "ol" || this.previousSpace < spaces) {
                if (this.currentList && this.previousSpace === spaces) {
                    this.builder.close(); // close last <li> before new OL
                }
                this.builder.create("ol", "list-decimal pl-6 spsace-y-2 text-teal-400");
                this.currentList = "ol";
            }
            this.builder.create("li");
            this._processInline(content);
            this.builder.close(); // close li
            if (this.previousSpace < spaces) this.indentationStack.push(spaces - this.previousSpace)
            this.previousSpace = spaces;
            return;
        }


        if (/^---+$/.test(trimmed)) { this.builder.createSingle("hr"); return; }


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
        if (this.previousSpace < spaces) this.indentationStack.push(spaces - this.previousSpace)
        this.previousSpace = spaces;
    }

    _processInline(text) {
        let i = 0;
        while (i < text.length) {
            // Bold (**text**)
            if (text.startsWith("**", i)) {
                let end = text.indexOf("**", i + 2);
                if (end !== -1) {
                    this.builder.create("strong");
                    if (text.indexOf("***", i + 2) !== -1) {
                        this._processInline(text.slice(i + 2, end + 1));
                        end++;
                    } else {
                        this._processInline(text.slice(i + 2, end));
                    }
                    this.builder.close();
                    i = end + 2;
                    continue;
                }
            }
            // Italic (*text*)
            if (text.startsWith("*", i)) {
                let end = text.indexOf("*", i + 1);
                if (end !== -1) {
                    this.builder.create("i");
                    this._processInline(text.slice(i + 1, end));
                    this.builder.close();
                    i = end + 1;
                    continue;
                }
            }
            // Emphasis (_text_)
            if (text.startsWith("_", i)) {
                let end = text.indexOf("_", i + 1);
                if (end !== -1) {
                    this.builder.create("em");
                    this.builder.innerText(text.slice(i + 1, end));
                    this.builder.close();
                    i = end + 1;
                    continue;
                }
            }
            // Inline code (`text`)
            if (text.startsWith("`", i) && !this.inCodeBlock) {
                let end = text.indexOf("`", i + 1);
                if (end !== -1) {
                    this.builder.create("codeblock");
                    this.builder.innerText(text.slice(i + 1, end));
                    this.builder.close();
                    i = end + 1;
                    continue;
                }
            }
            // Strikethrough (~~text~~)
            if (text.startsWith("~~", i)) {
                let end = text.indexOf("~~", i + 2);
                if (end !== -1) {
                    this.builder.create("del");
                    this.builder.innerText(text.slice(i + 2, end));
                    this.builder.close();
                    i = end + 2;
                    continue;
                }
            }
            // Image ![alt](src)
            if (text.startsWith("![", i)) {
                let altEnd = text.indexOf("]", i + 2);
                let srcStart = text.indexOf("(", altEnd);
                let srcEnd = text.indexOf(")", srcStart);
                if (altEnd !== -1 && srcStart !== -1 && srcEnd !== -1) {
                    let alt = text.slice(i + 2, altEnd);
                    let src = text.slice(srcStart + 1, srcEnd);

                    this.builder.create("img");
                    let imgEl = this.builder.stack.at(-1);
                    imgEl.setAttribute("src", src);
                    imgEl.setAttribute("alt", alt);
                    this.builder.close();

                    i = srcEnd + 1;
                    continue;
                }
            }
            // Link [text](url)
            if (text.startsWith("[", i)) {
                let txtEnd = text.indexOf("]", i + 1);
                let hrefStart = text.indexOf("(", txtEnd);
                let hrefEnd = text.indexOf(")", hrefStart);
                if (txtEnd !== -1 && hrefStart !== -1 && hrefEnd !== -1) {
                    let linkText = text.slice(i + 1, txtEnd);
                    let href = text.slice(hrefStart + 1, hrefEnd);

                    this.builder.create("a", "text-blue-300");
                    let aEl = this.builder.stack.at(-1);
                    aEl.setAttribute("href", href);
                    this._processInline(linkText);
                    this.builder.close();

                    i = hrefEnd + 1;
                    continue;
                }
            }
            this.builder.innerText(text[i]);
            i++;
        }
    }


    _reset() {
        while (this.builder.stack.length > 1) this.builder.close();
    }
}
