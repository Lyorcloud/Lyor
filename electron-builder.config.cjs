/* global module, process, require, __dirname */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { existsSync } = require('node:fs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('node:path')

const isPublishCommand = process.argv.includes("--publish") &&
  !process.argv.includes("never")
const allowUnsignedTestRelease = isPublishCommand &&
  process.env.LYOR_ALLOW_UNSIGNED_TEST_RELEASE === 'true'

// The verified public repository for stable Lyor Windows releases.
const releaseOwner = "Lyorcloud"
const releaseRepo = "Lyor"
const githubToken = (process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN)?.trim()
const localRuntimeConfig = join(__dirname, 'build', 'runtime-config.local.json')
const productionRuntimeConfig = join(__dirname, 'build', 'runtime-config.production.json')
const packageProductionRuntime = isPublishCommand || process.env.LYOR_RUNTIME_CONFIG === 'production'
const runtimeConfig = packageProductionRuntime ? productionRuntimeConfig : localRuntimeConfig

function requireReleaseEnvironment() {
  const missing = []

  if (!githubToken) {
    missing.push("GH_TOKEN")
  }

  if (!existsSync(productionRuntimeConfig)) {
    missing.push("build/runtime-config.production.json")
  }

  if (missing.length > 0) {
    throw new Error(
      `Windows release publishing requires: ${missing.join(", ")}. ` +
        "Set them as environment variables; never commit the token.",
    )
  }
}

if (packageProductionRuntime && !existsSync(productionRuntimeConfig)) {
  throw new Error(
    'Production Windows packaging requires build/runtime-config.production.json. ' +
      'Run npm run prepare:production-runtime with the public Supabase environment values.',
  )
}

if (isPublishCommand) {
  requireReleaseEnvironment()
}

const publish = [
  {
    provider: "github",
    owner: releaseOwner,
    repo: releaseRepo,
    protocol: "https",
    releaseType: "release",
    publishAutoUpdate: true,
  },
]

module.exports = {
  appId: "com.lyor.desktop",
  productName: "Lyor",
  asar: true,
  forceCodeSigning: isPublishCommand && !allowUnsignedTestRelease,
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },
  directories: {
    output: "release",
    buildResources: "build",
  },
  files: ["dist/**/*", "dist-electron/**/*", "package.json"],
  extraResources: existsSync(runtimeConfig)
    ? [{ from: runtimeConfig, to: 'runtime-config.json' }]
    : [],
  publish,
  win: {
    icon: "build/lyor-icon.png",
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
    shortcutName: "Lyor",
  },
}
