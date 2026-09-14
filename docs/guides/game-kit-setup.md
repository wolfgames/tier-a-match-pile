# GameKit / GitHub Packages Setup

`@wolfgames/*` packages (game-sdk packages like `@wolfgames/client` and `@wolfgames/dev`, plus `@wolfgames/components`, `@wolfgames/cortex`, …) are hosted on GitHub Packages. You need a GitHub Personal Access Token (classic) to install them.

## 1. Create a Classic Token

1. Go to https://github.com/settings/tokens
2. Click **Generate new token** → **Generate new token (classic)**
3. Name: `wolfgames-packages` (or whatever you like)
4. Expiration: choose your preference
5. Scopes: check **`read:packages`**
6. Click **Generate token** and copy it (starts with `ghp_`)

> **Important:** You must use a **classic** token, not a fine-grained token. Fine-grained tokens have limited GitHub Packages support.

## 2. Configure npm Registry

Create or update `~/.npmrc` (in your home directory, not the project):

```
@wolfgames:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

This tells npm/bun to fetch `@wolfgames` packages from GitHub Packages and authenticate using the `NODE_AUTH_TOKEN` environment variable.

## 3. Set the Token in Your Shell

Add this line to `~/.zshrc` (or `~/.bashrc`):

```sh
export NODE_AUTH_TOKEN="<your-token-here>"
```

Then reload your shell:

```sh
source ~/.zshrc
```

## 4. Install

```sh
bun install
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| **401 Unauthorized** | Token not being sent | Check that `NODE_AUTH_TOKEN` is set: `echo $NODE_AUTH_TOKEN` |
| **403 Forbidden** | Wrong token type or missing scope | Use a **classic** token with `read:packages` scope |
| **404 Not Found** | Registry misconfigured | Check `~/.npmrc` has the `@wolfgames:registry` line |
