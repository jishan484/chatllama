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
        if (this.currentElem.querySelector('temp')) {
            this.currentElem.querySelector('temp').textContent += str;
        } else {
            this.currentElem.appendChild(document.createElement("temp"));
            this.currentElem.querySelector('temp').textContent += str;
        }
    }

    reset() {
        this.currentElem.querySelectorAll('temp').forEach(temp => temp.remove());
    }
}

class StreamingMarked {
    constructor(rootElement) {
        this.builder = new DOMBuilder(rootElement);
        this.lineBuffer = "";
        this.inCodeBlock = false;
        this.codeBlockLang = null;
        this.currentTable = null;
        this.listStack = []; // stack for nested <ul>/<ol>
        this.nestedListDecorLookup = [
            '•',   // solid dot, clean
            '◦',   // hollow dot
            '▪',   // small square
            '‣',   // triangular bullet
            '⁃',   // short dash
            '›',   // single angle
            '»'    // double angle
        ];
        this.customTagsClassLookup = new Map([
            ["think", "italic text-gray-600"],  // like <think>
            ["sub", "text-xs align-sub text-gray-500 bg-gray-100 px-1 rounded-sm"],  // <sub>
            ["note", "block px-4 py-2 my-2 border-l-4 border-blue-500 bg-blue-100 text-blue-800 text-sm rounded"], // <note>
            ["warning", "block px-4 py-2 my-2 border-l-4 border-red-500 bg-red-100 text-red-800 font-semibold text-sm rounded"], // <warning>
            ["codeblock", "bg-[#0c2721] px-1.5 mx-1 rounded-[5px] text-[#44babe]"], //codeblock
            ["math", "font-serif bg-gray-400 text-gray-800 px-1 rounded text-sm"], //math
        ]);
        this.customTags = Array.from(this.customTagsClassLookup.keys());
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
        this._closeAllLists();
        if (this.inCodeBlock) {
            if (hljs) hljs.highlightElement(this.builder.stack.at(-1));
            this.builder.close(); this.builder.close();
            this.inCodeBlock = false;
            this.codeBlockLang = null;
        }
        if (this.currentTable) {
            this.builder.close(); this.currentTable = null;
        }
    }

    _processLine(line) {
        const trimmed = line.trim();
        let spaces = 0;
        while (line.charAt(spaces) === ' ' && spaces < line.length) spaces++;

        // --- Empty line ---
        if (!trimmed && !this.inCodeBlock) {
            this._closeAllLists();
            if (this.inCodeBlock) {
                this.builder.innerText("\n");
            } else {
                this.builder.createSingle("br");
            }
            return;
        }

        // --- LISTS (stack-based) ---
        const ulMatch = /^[-*+]\s+(.+)$/.exec(trimmed);
        const olMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed);
        if (ulMatch || olMatch) {
            const listType = ulMatch ? "ul" : "ol";
            const content = ulMatch ? ulMatch[1] : olMatch[2];
            const indentLevel = Math.floor(spaces / 2);

            this._adjustListStack(indentLevel, listType);
            this.builder.create("li", (this.listStack.length > 0 && this.listStack.at(-1) != 'ol') ? `before:content-['${this.nestedListDecorLookup[(this.listStack.filter(x => x).length < this.nestedListDecorLookup.length) ? this.listStack.filter(x => x).length - 1 : this.nestedListDecorLookup.length - 1]}'] before:ml-2 before:mr-1 before:text-teal-${8 - (this.listStack.filter(x => x).length % 4)}00 break-words` : "break-words");
            this._processInline(content);
            this.builder.close();
            return;
        }

        // --- Table ---
        if (trimmed.startsWith("|")) {
            const cells = trimmed.split("|").map(c => c.trim());
            if (!this.currentTable) {
                this.builder.create("table", "table-fixed border-collapse w-full my-2");
                this.builder.create("thead", "bg-gray-600");
                this.builder.create("tr");
                cells.shift();
                cells.pop();
                cells.forEach(h => {
                    this.builder.create("th", "border px-4 py-2 text-left font-bold");
                    this._processInline(h);
                    this.builder.close();
                });
                this.builder.close();
                this.builder.close();
                this.builder.create("tbody");
                this.currentTable = "header-done";
                return;
            }
            if (this.currentTable === "header-done" && cells.some(c => /^-+$/.test(c))) {
                this.currentTable = "body";
                return;
            }
            if (this.currentTable) {
                this.builder.create("tr");
                cells.filter(c => c.length > 0).forEach(c => {
                    this.builder.create("td", "border px-4 py-2");
                    this._processInline(c);
                    this.builder.close();
                });
                this.builder.close();
                return;
            }
        } else if (this.currentTable) {
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
            this._closeAllLists();
            this.builder.create(`h${level}`, `text-pink-${100 + (((level <= 4) ? level : 4) * 100)}`);
            this._processInline(headerMatch[2]);
            this.builder.close();
            return;
        }

        // --- Horizontal Rule ---
        // Matches any line with at least 3 of -, *, _ with optional spaces
        if (/^(?: {0,3}[-*_]\s*){3,}$/.test(trimmed)) {
            this._closeAllLists();
            this.builder.createSingle("hr");
            return;
        }

        for (let tag of this.customTags) {
            if (trimmed.startsWith(`<${tag}>`)) {
                this.builder.create(tag, this.customTagsClassLookup.get(tag));  // create element
                this.builder.innerText(trimmed.replace(new RegExp(`<\\/?${tag}>`, "ig"), ""));
                return;
            }

            if (trimmed.startsWith(`</${tag}>`)) {
                this.builder.innerText(trimmed.replace(new RegExp(`<\\/?${tag}>`, "ig"), ""));
                this.builder.close();  // close element
                return;
            }
        }


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

        // --- Paragraph ---
        this._closeAllLists();
        this.builder.create("p");
        this._processInline(trimmed);
        this.builder.close();
    }

    _adjustListStack(level, type) {
        // Close deeper lists if we went back
        while (this.listStack.length > level) {
            this.builder.close();
            this.listStack.pop();
        }

        // Open new lists if deeper
        while (this.listStack.length < level) {
            this.builder.create(type, type === "ul"
                ? "list-none list-inside pl-3 text-gray-400"
                : "list-decimal list-inside pl-" + (level + 1) + " text-teal-400"
            );
            this.listStack.push(type);
        }

        // If same level but type changed, replace
        if (this.listStack.length && this.listStack[this.listStack.length - 1] !== type) {
            this.builder.close();
            this.listStack.pop();
            this.builder.create(type, type === "ul"
                ? "list-none list-inside pl-6 text-gray-400"
                : "list-decimal list-inside pl-" + (level + 1) + " text-teal-400"
            );
            this.listStack.push(type);
        }

        if (this.listStack.length == 0) {
            this.builder.create(type, type === "ul"
                ? "list-none list-inside pl-6 text-gray-400"
                : "list-[square] list-inside pl-6 text-teal-400"
            );
            this.listStack.push(type);
        }
    }

    _closeAllLists() {
        while (this.listStack.length > 0) {
            this.builder.close();
            this.listStack.pop();
        }
    }

    _processInline(text) {
        let i = 0;
        while (i < text.length) {
            if (text.startsWith("**", i)) {
                let end = text.indexOf("**", i + 2);
                if (end !== -1) {
                    this.builder.create("strong");
                    let idnx = text.indexOf("***", i + 2);
                    if (idnx !== -1 && idnx <= end) {
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
            if (text.startsWith("`", i) && !this.inCodeBlock) {
                let end = text.indexOf("`", i + 1);
                if (end !== -1) {
                    this.builder.create("codeblock", this.customTagsClassLookup.get("codeblock"));
                    this.builder.innerText(text.slice(i + 1, end));
                    this.builder.close();
                    i = end + 1;
                    continue;
                }
            }
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
            if (text[i] === "$") {
                let end = text.indexOf("$", i + 1);
                if (end !== -1) {
                    this.builder.create("math", this.customTagsClassLookup.get("math"));
                    this.builder.innerText(text.slice(i + 1, end));
                    this.builder.close();
                    i = end + 1;
                    continue;
                }
            }
            this.builder.innerText(text[i]);
            i++;
        }
    }

    _reset() {
        while (this.builder.stack.length > 1 && this.listStack.length == 0) {
            this.builder.close();
        }
    }
}
