// A small one-pass highlighter for code blocks: comments, strings, numbers, keywords, types and
// function calls, by a few rules per family of languages. Enough to tell code apart at a glance;
// a line never depends on the lines around it, so a block streaming in highlights as it grows.

export type Token = { text: string; kind: 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'type' | 'call' | 'punct' | 'key' }

type Lang = { comment: RegExp | null; keywords: Set<string>; strings: RegExp }

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean))

const C_LIKE = words(`
  break case catch class const continue default delete do else enum export extends false finally for from function
  if import in instanceof interface let new null return static super switch this throw true try type typeof undefined
  var void while with yield async await of as implements private protected public readonly abstract declare keyof
  namespace satisfies infer never unknown any string number boolean bigint symbol object
  func go chan defer fallthrough map package range select struct goto nil
  fn impl let mut match mod pub use where crate self Self trait unsafe loop dyn move ref
  int float double char long short unsigned signed void bool auto sizeof typedef union volatile
`)
const PY = words(`
  and as assert async await break class continue def del elif else except False finally for from global if import in
  is lambda None nonlocal not or pass raise return True try while with yield self print match case
`)
const SH = words(`
  if then else elif fi for while until do done case esac function in return local export readonly declare set unset
  echo cd source exit shift trap eval exec true false
`)

const LANGS: Record<string, Lang> = {
  c: { comment: /^(\/\/.*|\/\*.*?(\*\/|$))/, keywords: C_LIKE, strings: /^(`(?:\\.|[^`\\])*`?|"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)/ },
  py: { comment: /^#.*/, keywords: PY, strings: /^([rbfu]?"""[\s\S]*?("""|$)|[rbfu]?'''[\s\S]*?('''|$)|[rbfu]?"(?:\\.|[^"\\])*"?|[rbfu]?'(?:\\.|[^'\\])*'?)/i },
  sh: { comment: /^#.*/, keywords: SH, strings: /^("(?:\\.|[^"\\])*"?|'[^']*'?)/ },
  data: { comment: /^#.*/, keywords: words('true false null yes no on off'), strings: /^("(?:\\.|[^"\\])*"?|'[^']*'?)/ },
}

const FAMILY: Record<string, keyof typeof LANGS> = {
  js: 'c', jsx: 'c', ts: 'c', tsx: 'c', javascript: 'c', typescript: 'c', mjs: 'c', cjs: 'c', json: 'data', jsonc: 'c',
  go: 'c', rust: 'c', rs: 'c', c: 'c', h: 'c', cpp: 'c', 'c++': 'c', java: 'c', kotlin: 'c', kt: 'c', swift: 'c',
  cs: 'c', csharp: 'c', scala: 'c', dart: 'c', php: 'c', css: 'c', scss: 'c', less: 'c',
  py: 'py', python: 'py', rb: 'py', ruby: 'py',
  sh: 'sh', bash: 'sh', zsh: 'sh', shell: 'sh', console: 'sh', fish: 'sh', dockerfile: 'sh', makefile: 'sh',
  yaml: 'data', yml: 'data', toml: 'data', ini: 'data', env: 'data',
}

export const isHighlighted = (lang: string) => lang.toLowerCase() in FAMILY

export function highlight(line: string, lang: string): Token[] {
  const family = FAMILY[lang.toLowerCase()]
  if (!family) return [{ text: line, kind: 'plain' }]
  const rules = LANGS[family]!
  const out: Token[] = []
  const push = (text: string, kind: Token['kind']) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ text, kind })
  }
  let rest = line
  // `key:` at a YAML line's start reads as a key.
  if (family === 'data') {
    const key = rest.match(/^(\s*-?\s*)("?[\w.-]+"?)(\s*[:=])/)
    if (key) {
      push(key[1]!, 'plain')
      push(key[2]!, 'key')
      push(key[3]!, 'punct')
      rest = rest.slice(key[0].length)
    }
  }
  while (rest.length > 0) {
    let m: RegExpMatchArray | null
    if (rules.comment && (m = rest.match(rules.comment))) {
      push(m[0], 'comment')
      rest = rest.slice(m[0].length)
    } else if ((m = rest.match(rules.strings))) {
      push(m[0], 'string')
      rest = rest.slice(m[0].length)
    } else if ((m = rest.match(/^(0x[\da-f_]+|\d[\d_]*(\.\d+)?(e[+-]?\d+)?)\b/i))) {
      push(m[0], 'number')
      rest = rest.slice(m[0].length)
    } else if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) {
      const word = m[0]
      const after = rest.slice(word.length)
      if (rules.keywords.has(word)) push(word, 'keyword')
      else if (/^\s*\(/.test(after)) push(word, 'call')
      else if (/^[A-Z][a-z0-9]/.test(word) && family !== 'sh') push(word, 'type')
      else push(word, 'plain')
      rest = after
    } else if ((m = rest.match(/^[{}()[\];,.:=<>+\-*/%!&|^~?@]+/))) {
      push(m[0], 'punct')
      rest = rest.slice(m[0].length)
    } else {
      push(rest[0]!, 'plain')
      rest = rest.slice(1)
    }
  }
  return out
}
