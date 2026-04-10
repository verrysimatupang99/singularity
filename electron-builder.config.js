/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.singularity.ide',
  productName: 'Singularity',
  copyright: `Copyright © ${new Date().getFullYear()}`,
  directories: { output: 'release', buildResources: 'build' },
  files: ['dist/**/*', 'node_modules/**/*', 'package.json'],
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }],
    icon: 'build/icon.png',
    category: 'Development',
  },
  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    icon: 'build/icon.icns',
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Singularity',
  },
  publish: {
    provider: 'github',
    owner: 'verrysimatupang99',
    repo: 'singularity',
    private: false,
    releaseType: 'release',
  },
}
