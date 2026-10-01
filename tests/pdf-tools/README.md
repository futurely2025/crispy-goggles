# PDF tools tests

Browser tests (Playwright + Chromium) for the pages in `web/tools/`.

```sh
python3 -m http.server 8765 -d web &      # serve the site
cd tests/pdf-tools && mkdir -p fx
node mkpdf.js && node mkbig.js && node mkimg.js && node mkdocx.js   # sample files into fx/
for t in t_merge t_split t_org t_prot t_img t_cmp t_comp t_word; do node $t.js; done
```

`th.js` is the shared harness (opens a tool page, captures downloads, reads PDFs with pdf-lib).
Edit the `require('/opt/node22/lib/node_modules/playwright')` path if Playwright lives elsewhere.
