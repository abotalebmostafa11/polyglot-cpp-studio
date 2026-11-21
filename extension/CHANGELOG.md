# Changelog

## 2.3.0

- Renamed the extension to Polyglot C++ Studio in VS Code and moved the project to its dedicated GitHub repository. Existing installations keep the same extension ID and commands.

## 2.2.0

- Packaged the Windows and macOS build runners with the VS Code extension so it can run independently of the Polyglot C++ Studio desktop app.
- Added **Set Up C++ Compiler** and compiler setup on first use. Windows setup verifies the toolchain download. On Apple silicon, setup checks for Apple Clang and the macOS SDK and resumes a pending run when Apple finishes installing them.
- Added a Bengali font fallback to the default C++ source editor on trusted local runs and setup while preserving custom editor fonts.
- Included UTF-8 build and run commands for new files, Bengali font support in the output pane, English, Arabic, Bengali, and Russian interface text, and navigation from compiler diagnostics to the source.
