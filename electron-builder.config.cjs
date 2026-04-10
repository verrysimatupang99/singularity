/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.singularity.ide',
  productName: 'Singularity',
  copyright: `Copyright \u00a9 ${new Date().getFullYear()}`,
  directories: { output: 'release', buildResources: 'build' },
  files: [
    'dist/**/*',
    'node_modules/**/*',
    'package.json'
  ],
  // Native modules that must be rebuilt for the packaged Electron version
  // electron-builder handles native rebuild automatically via asarUnpack
  asarUnpack: [
    'node_modules/@nut-tree/**/*',
    'node_modules/@nut-tree-fork/**/*',
    'node_modules/node-pty/**/*',
    'node_modules/keytar/**/*'
  ],
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] }
    ],
    icon: 'build/icon.png',
    category: 'Development',
    desktop: {
      Name: 'Singularity',
      Comment: 'Multi-provider AI coding agent desktop app',
      Keywords: 'AI;coding;developer;'
    }
  },
  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    icon: 'build/icon.icns',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Singularity',
  },
  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' }
    ]
  },
  deb: {
    depends: ['libnss3', 'libatk-bridge2.0-0', 'libgtk-3-0']
  },
  publish: {
    provider: 'github',
    owner: 'verrysimatupang99',
    repo: 'singularity',
    private: false,
    releaseType: 'release',
  },
}
