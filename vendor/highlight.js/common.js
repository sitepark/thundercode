/*
 * Hand-authored. This file has no upstream counterpart that can be used
 * directly: highlight.js ships `lib/common.js`, but it is CommonJS
 * (`require`/`module.exports`) and there is no ESM build of it - `es/common.js`
 * is a four-line Node interop shim that re-exports the CommonJS core, which a
 * browser `<script type="module">` cannot load. See PROVENANCE.md.
 *
 * The content is nonetheless a mechanical transcription rather than a design
 * decision: the language names and their order are exactly the 36
 * `registerLanguage` calls of upstream `lib/common.js`, in upstream's order. A
 * version bump re-transcribes that file; it does not re-decide anything.
 *
 * Every specifier carries its `.js` extension because a browser's module
 * resolver has no extension guessing. That is also valid Node ESM, which is
 * what lets the test runner import the same file the popup loads.
 */
import hljs from "./core.js";

import xml from "./languages/xml.js";
import bash from "./languages/bash.js";
import c from "./languages/c.js";
import cpp from "./languages/cpp.js";
import csharp from "./languages/csharp.js";
import css from "./languages/css.js";
import markdown from "./languages/markdown.js";
import diff from "./languages/diff.js";
import ruby from "./languages/ruby.js";
import go from "./languages/go.js";
import graphql from "./languages/graphql.js";
import ini from "./languages/ini.js";
import java from "./languages/java.js";
import javascript from "./languages/javascript.js";
import json from "./languages/json.js";
import kotlin from "./languages/kotlin.js";
import less from "./languages/less.js";
import lua from "./languages/lua.js";
import makefile from "./languages/makefile.js";
import perl from "./languages/perl.js";
import objectivec from "./languages/objectivec.js";
import php from "./languages/php.js";
import phpTemplate from "./languages/php-template.js";
import plaintext from "./languages/plaintext.js";
import python from "./languages/python.js";
import pythonRepl from "./languages/python-repl.js";
import r from "./languages/r.js";
import rust from "./languages/rust.js";
import scss from "./languages/scss.js";
import shell from "./languages/shell.js";
import sql from "./languages/sql.js";
import swift from "./languages/swift.js";
import yaml from "./languages/yaml.js";
import typescript from "./languages/typescript.js";
import vbnet from "./languages/vbnet.js";
import wasm from "./languages/wasm.js";

hljs.registerLanguage("xml", xml);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("go", go);
hljs.registerLanguage("graphql", graphql);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("less", less);
hljs.registerLanguage("lua", lua);
hljs.registerLanguage("makefile", makefile);
hljs.registerLanguage("perl", perl);
hljs.registerLanguage("objectivec", objectivec);
hljs.registerLanguage("php", php);
hljs.registerLanguage("php-template", phpTemplate);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("python", python);
hljs.registerLanguage("python-repl", pythonRepl);
hljs.registerLanguage("r", r);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("scss", scss);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("vbnet", vbnet);
hljs.registerLanguage("wasm", wasm);

export default hljs;
