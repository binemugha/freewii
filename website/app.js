const releases = 'https://github.com/binemugha/freewii/releases/latest';
const button = document.querySelector('#primary-download');
const note = document.querySelector('#release-note');
const agent = navigator.userAgent.toLowerCase();

if (agent.includes('win')) {
  button.href = `${releases}/download/FreeWii-win-x64.exe`;
  button.textContent = 'Download for Windows';
} else if (agent.includes('mac')) {
  button.href = `${releases}/download/FreeWii-mac-arm64.dmg`;
  button.textContent = 'Download for macOS';
  note.textContent = 'Apple Silicon build. Intel and other downloads are below.';
} else if (agent.includes('linux')) {
  button.href = `${releases}/download/FreeWii-linux-x86_64.AppImage`;
  button.textContent = 'Download for Linux';
}
