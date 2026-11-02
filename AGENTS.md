# Test data and privacy

- Never copy a user's diagnoses, clinical notes, document extracts, case reports,
  or identifying details from chats or files into tracked source, tests, docs,
  commit messages, issues, or logs intended for publication.
- Reproduce bugs with independently invented terms, fictional abbreviations, and
  synthetic records. Preserve the failure mechanism without preserving the case.
- The established public reference catalogs under `config/seeds` and
  `bundled_config/knowledge` are reference data, not user case reports. Keep that
  distinction explicit when writing tests that iterate over these catalogs.
- Keep incident evidence, sensitive search patterns, and private fixtures outside
  the repository. Never commit a blacklist containing the original private text.
- Before publishing, review changed fixtures, parametrized test IDs, assertions,
  screenshots, docs examples, and generated artifacts for copied user content.
