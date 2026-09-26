---
name: app-store-connect
description: Orchestrates iOS and macOS App Store release lifecycles using the asc CLI. Covers automated Xcode builds, version/build number bumping, TestFlight distribution, metadata and screenshot synchronization, readiness gates, and App Store review submission.
---

# App Store Connect Release Orchestration

Guides the agent through automating Apple App Store deployments, TestFlight distribution, metadata synchronization, and review submissions using the `asc` CLI.

---

## 1. Prerequisites & Authentication

Ensure the `asc` CLI and Xcode Command Line Tools are available. Authenticate via one of two methods:

### Interactive / Session Auth

```bash
asc auth login
asc auth status
```

### Headless / CI Environment Variables

Configure the App Store Connect API Key in the environment:

```bash
export ASC_KEY_ID="ABC1234567"
export ASC_ISSUER_ID="00000000-0000-0000-0000-000000000000"
export ASC_PRIVATE_KEY_PATH="$HOME/.private_keys/AuthKey_ABC1234567.p8"
# Or provide base64-encoded private key directly:
# export ASC_PRIVATE_KEY_BASE64="LS0tLS1CRUdJTi..."
```

Verify authentication before proceeding:

```bash
asc apps list --output table
```

---

## 2. Version & Build Number Management

Prevent build-number rejection during upload by reading and bumping against remote App Store Connect records:

```bash
# View current Xcode target version and build
asc xcode version view --project "./App.xcodeproj"

# Query the next available remote build number and apply it directly
asc xcode version edit \
  --next-build-number \
  --app "APP_ID" \
  --platform IOS \
  --project "./App.xcodeproj" \
  --output json

# Bump semantic release version (e.g., 1.2.3 -> 1.3.0)
asc xcode version bump --type minor --project "./App.xcodeproj"
```

---

## 3. Build, Archive & Export Automation

Prefer `asc xcode` wrappers over raw `xcodebuild` invocations for deterministic configuration and signing.

### Archive

```bash
asc xcode archive \
  --workspace "App.xcworkspace" \
  --scheme "App" \
  --configuration Release \
  --clean \
  --archive-path ".asc/artifacts/App.xcarchive" \
  --xcodebuild-flag=-destination \
  --xcodebuild-flag=generic/platform=iOS \
  --output json
```

### Export & Upload

```bash
# Export IPA locally for inspection
asc xcode export \
  --archive-path ".asc/artifacts/App.xcarchive" \
  --export-path ".asc/artifacts/App.ipa"

# Export and directly upload to App Store Connect, awaiting processing
asc xcode export \
  --archive-path ".asc/artifacts/App.xcarchive" \
  --wait \
  --output json
```

---

## 4. TestFlight Distribution

Orchestrate beta groups, external testers, and release notes:

```bash
# List beta tester groups
asc testflight groups list --app "APP_ID" --paginate

# Add build to external tester group
asc builds add-groups \
  --build-id "BUILD_ID" \
  --group "GROUP_ID"

# Add "What to Test" notes for testers
asc builds test-notes create \
  --build-id "BUILD_ID" \
  --locale "en-US" \
  --whats-new "Bug fixes and performance improvements."
```

---

## 5. Metadata & Asset Synchronization

Keep localized app store metadata in version-controlled directories (e.g. `./metadata`).

```bash
# Pull current metadata from App Store Connect into local directory
asc metadata pull \
  --app "APP_ID" \
  --version "1.3.0" \
  --output-dir "./metadata/version/1.3.0"

# Preview staged metadata changes (dry-run)
asc metadata push \
  --app "APP_ID" \
  --version "1.3.0" \
  --metadata-dir "./metadata/version/1.3.0" \
  --dry-run \
  --output table

# Apply metadata changes
asc metadata push \
  --app "APP_ID" \
  --version "1.3.0" \
  --metadata-dir "./metadata/version/1.3.0" \
  --confirm
```

---

## 6. Readiness Gates & Review Submission

Always run the validation readiness gate before submitting for review:

```bash
# Strict validation check (stops on warnings and digital goods blockers)
asc validate \
  --app "APP_ID" \
  --version "1.3.0" \
  --platform IOS \
  --strict \
  --output table

# Stage version with attached build and metadata
asc release stage \
  --app "APP_ID" \
  --version "1.3.0" \
  --build "BUILD_ID" \
  --metadata-dir "./metadata/version/1.3.0" \
  --confirm

# Submit for App Store review
asc review submit \
  --app "APP_ID" \
  --version "1.3.0" \
  --build "BUILD_ID" \
  --dry-run \
  --output table

# Confirm submission
asc review submit \
  --app "APP_ID" \
  --version "1.3.0" \
  --build "BUILD_ID" \
  --confirm
```

---

## 7. Safety Rules

1. **Mandatory Dry Run**: Always invoke commands with `--dry-run` or check the table output before running with `--confirm`.
2. **Key Security**: Never commit `.p8` private keys or API secret credentials into source control. Keep them in secure environment variables or keychain credentials.
3. **Idempotency**: Use explicit resource IDs (`--version-id`, `--build-id`) when known to avoid race conditions in multi-target projects.
