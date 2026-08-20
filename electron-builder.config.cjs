/* global module, process */

const isPublishCommand = process.argv.includes("--publish") &&
  !process.argv.includes("never")

// The verified public repository for stable Lyor Windows releases.
const releaseOwner = "Lyorcloud"
const releaseRepo = "Lyor"
const githubToken = (process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN)?.trim()

function requireReleaseEnvironment() {
  const missing = []

  if (!githubToken) {
    missing.push("GH_TOKEN")
  }

  if (missing.length > 0) {
    throw new Error(
      `Windows release publishing requires: ${missing.join(", ")}. ` +
        "Set them as environment variables; never commit the token.",
    )
  }
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
  electronDist: "node_modules/electron/dist",
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
