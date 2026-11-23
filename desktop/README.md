# Polyglot C++ Studio 2.4.1

Desktop editor created and designed by Associate Professor Mostafa Abotaleb, Yugra State University.

Open the installed Polyglot C++ Studio. Version 2.4.1 appears beside its name. On Windows the app reuses the CppStart compiler or downloads and checks LLVM-MinGW. On an Apple Silicon Mac, install Apple's Command Line Tools if prompted on the first run.

The source editor colours C++ keywords, types, calls, strings, numbers, comments and preprocessor directives as you type or open a file. Light and dark themes use separate palettes. The saved C++ source remains plain UTF-8. The editor ships its C++ grammar for offline use.

Select lines and press Tab to indent four spaces or Shift+Tab to move them back. After typing a member operator, Clang lists accessible members for the expression. Type to filter, use the arrow keys, then press Enter or Tab. Click a suggestion to insert it with the mouse. Completion uses the installed compiler and local headers.

Screenshot saves a PNG of the visible editor, input and output. Record video asks for an MP4 destination. Use Pause and Resume during the lesson, then Stop and save. The encoder produces H.264 at 30 fps with CRF 15 and a 1920 × 1080 landscape canvas. Portrait windows use 1080 × 1920. Recording includes the application image and omits audio.

[Light theme](previews/light.png) · [Dark theme](previews/dark.png)

The desktop package includes the Polyglot C++ Studio 2.3.0 VS Code extension. Desktop recording controls are available inside the desktop editor.

## Packaging

The release was cross-built on Debian 13 x86-64 with Python 3.12, Node.js 22 or newer, Git, unzip, a C++ compiler and make. From the repository root run the following commands. The downloader checks the official Electron 45.4.1 files against their release hashes. It also downloads the encoder binaries from their npm distributions and NSIS from Debian. The macOS bundle is ad-hoc signed.

```sh
mkdir -p buildtools/node
python3 desktop/packaging/get.py
npm install --prefix buildtools/node resedit@3.1.1
cp desktop/packaging/brand.mjs buildtools/node/
git clone https://github.com/hogliux/bomutils.git buildtools/bomutils
git -C buildtools/bomutils checkout c247002e2f49878bab32dd0fcf805810ae0992cb
make -C buildtools/bomutils
python3 desktop/packaging/package.py win
python3 desktop/packaging/package.py mac
```

The installers appear in desktop-downloads. The Windows installers target x64 and carry the same application payload. The macOS installer contains an arm64 application under Applications. Release validation checks the Clang completion list, selected-line editing, Unicode I/O, compiler error navigation, screenshot, video pause/resume, code signatures, installer archives and the application payload.

To rebuild the bundled parser, run `npm ci` and `npm run build` in `desktop/packaging/syntax`.
