# The website

bezier-cad.xyz: Product, Download, Learn and Developers, the four tabs. Plain files, built by one Node
script with no dependencies, served by any web space.

```bash
node website/build/build.mjs     # website/dist
```

| | |
| --- | --- |
| `pages/` | The pages, as HTML with their title and tab in the first line. `{{icon:name}}` draws a brand icon |
| `build/` | The build: the frame and the tabs (`layout.mjs`), the developer wiki from `docs/sdk` and `docs/mcp` (`markdown.mjs`) |
| `assets/` | Styles, the little script (film, downloads), the intro film |
| `static/` | Copied as is: `.htaccess`, `404.html`, `robots.txt` |
| `deploy/` | `releases.mjs` (newest stable and beta from GitHub), `app.htaccess` (the browser app) |
| [`DEPLOY.md`](DEPLOY.md) | Setting up IONOS and GitHub once, releasing, checking |

The film is `assets/film/intro.mp4`, the one the app plays on its first start.
