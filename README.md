This is a mobile-focused web client for the BBS protocol, using Angular. See: https://github.com/guregu/bbs

I hacked it together in a couple days for a school project, so it is a bit rough around the edges. I'm in the process of cleaning it up and adding more features. 

It expects index.html to be served at `/`, and static at `/static/`. It also expects a file called `/index.json` that might look something like this:
```json
[{"path":"/eti"},{"path":"/4chan"}]
```
Where each `"path"` is a BBS endpoint. Some servers can take care of this for you. 