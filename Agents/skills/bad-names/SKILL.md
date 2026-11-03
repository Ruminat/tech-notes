---
name: bad-names
description: Rename overly-generic identifiers.
disable-model-invocation: true
---

# bad-names

Fix bad, overly-generic names in the code — above all for anything visible outside its own file (`export`, public functions/types/constants). The name must say **what it belongs to** on its own, without opening the definition.

Generic names (`isConfigured`, `getById`, `parse`, `serialize`, `handle`, `update`, `data`, `config`) are visible project-wide once `export`ed and blur into a mass of identical identifiers: the name alone doesn't tell you what it's about, and two different `getById` in imports are indistinguishable.

How to fix:
- Qualify the name with its domain/entity: `isConfigured` → `isS3Configured`, `getById` → `getProjectById`, `parse` → `parseAvatarSignature`. At the call site the name must read unambiguously.
- The wider the visibility, the stricter the rule. Exported names must be self-describing. Purely local (non-exported) names get slack: if the immediate context makes it obvious, leave them.
- Don't inflate the public surface: don't export private things for convenience; if you do export, give it a domain name.
- Don't mangle: don't bolt on prefixes mechanically or duplicate what's already clear from the type/module under an explicit namespace import. The goal is readability, not length.

Important: fix **your own code** (what you added/changed this session); other/existing code only on the user's explicit request.

If you think some generic name is fine to keep — explain why.
