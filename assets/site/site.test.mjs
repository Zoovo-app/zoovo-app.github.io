// Checks for the public pages. Run from the repo root: node --test assets/site/site.test.mjs
// No dependencies: the pages are small and hand-written, so a tag scanner is
// enough.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pages = ['index.html', 'pros/index.html', 'booking/index.html', 'safety/index.html', 'faq/index.html', '404.html'];
const html = Object.fromEntries(pages.map((p) => [p, readFileSync(join(root, p), 'utf8')]));

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(root, 'assets/site/nl.js'), 'utf8'), sandbox);
const NL = sandbox.window.ZOOVO_NL;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const tags = (src) => [...src.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)].map((m) => ({ close: m[1] === '/', name: m[2].toLowerCase(), attrs: m[3] }));
const attr = (attrs, name) => (attrs.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];

function keysOf(src) {
  return [...src.matchAll(/\sdata-t(?:-alt|-aria)?="([^"]+)"/g)].map((m) => m[1]);
}

test('every key on the pages has Dutch text, and no Dutch text is unused', () => {
  const used = new Set();
  for (const [page, src] of Object.entries(html)) {
    for (const key of keysOf(src)) {
      used.add(key);
      assert.ok(key in NL, `${page}: no Dutch text for "${key}"`);
    }
    const id = attr(src.match(/<body([^>]*)>/)[0], 'data-page');
    for (const k of [`${id}.title`, `${id}.desc`]) {
      used.add(k);
      assert.ok(k in NL, `${page}: no Dutch "${k}"`);
    }
  }
  const unused = Object.keys(NL).filter((k) => !used.has(k));
  assert.deepEqual(unused, [], 'Dutch keys no page uses');
});

test('translated elements are not nested (site.js swaps their whole content)', () => {
  for (const [page, src] of Object.entries(html)) {
    const stack = [];
    for (const t of tags(src)) {
      if (VOID.has(t.name)) continue;
      if (t.close) { stack.pop(); continue; }
      const translated = /\sdata-t="/.test(t.attrs);
      if (translated) assert.ok(!stack.includes(true), `${page}: data-t inside data-t at <${t.name}${t.attrs}>`);
      stack.push(translated);
    }
  }
});

test('the strict CSP holds: no inline styles or scripts, nothing from other hosts', () => {
  for (const [page, src] of Object.entries(html)) {
    assert.ok(src.includes('Content-Security-Policy'), `${page}: no CSP`);
    assert.doesNotMatch(src, /\sstyle="/, `${page}: inline style attribute`);
    assert.doesNotMatch(src, /<style/, `${page}: <style> block`);
    assert.doesNotMatch(src, /\son[a-z]+="/, `${page}: inline event handler`);
    for (const t of tags(src).filter((t) => t.name === 'script' && !t.close)) {
      assert.ok(attr(t.attrs, 'src')?.startsWith('/assets/site/'), `${page}: inline or foreign script`);
    }
    for (const t of tags(src).filter((t) => ['img', 'link'].includes(t.name))) {
      const url = attr(t.attrs, 'src') || attr(t.attrs, 'href');
      if (attr(t.attrs, 'rel') === 'canonical') continue;
      assert.ok(url?.startsWith('/'), `${page}: ${t.name} not served from this site: ${url}`);
    }
  }
});

test('local links and images point at files that exist', () => {
  const exists = (path) => {
    const p = join(root, decodeURI(path.split(/[?#]/)[0]));
    return existsSync(p) && (!statSync(p).isDirectory() || existsSync(join(p, 'index.html')));
  };
  const sources = { ...html, nl: Object.values(NL).join(' ') };
  for (const [page, src] of Object.entries(sources)) {
    for (const m of src.matchAll(/(?:href|src)="(\/[^"]*)"/g)) assert.ok(exists(m[1]), `${page}: missing ${m[1]}`);
    for (const m of src.matchAll(/srcset="([^"]*)"/g)) {
      for (const part of m[1].split(',')) assert.ok(exists(part.trim().split(' ')[0]), `${page}: missing ${part}`);
    }
  }
});

test('every image has an alt attribute', () => {
  for (const [page, src] of Object.entries(html)) {
    for (const t of tags(src).filter((t) => t.name === 'img')) {
      assert.match(t.attrs, /\salt="/, `${page}: img without alt: ${t.attrs}`);
    }
  }
});
