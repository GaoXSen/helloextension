document.addEventListener('DOMContentLoaded', () => {
  const btnEarth = document.getElementById('btn-earth');
  const btnGalaxy = document.getElementById('btn-galaxy');
  const btnCalc = document.getElementById('btn-calc');
  const btnSnake = document.getElementById('btn-snake');
  const btnSnake3d = document.getElementById('btn-snake3d');
  const btnMatch3d = document.getElementById('btn-match3d');
  const msg = document.getElementById('msg');

  function openPage(page, label) {
    const url = chrome.runtime.getURL(page);
    try {
      chrome.tabs.create({ url });
      window.close();
    } catch (e) {
      msg.textContent = `正在打开${label}… ` + url;
      location.href = url;
    }
  }

  btnEarth?.addEventListener('click', () => openPage('pages/globe/index.html', '地球'));
  btnGalaxy?.addEventListener('click', () => openPage('pages/galaxy/index.html', '银河系'));
  btnCalc?.addEventListener('click', () => openPage('pages/calc/index.html', '科学计算器'));
  btnSnake?.addEventListener('click', () => openPage('pages/snake2d/index.html', '贪吃蛇'));
  btnSnake3d?.addEventListener('click', () => openPage('pages/snake3d/index.html', '3D 贪吃蛇'));
  btnMatch3d?.addEventListener('click', () => openPage('pages/match3d/index.html', '3D 消消乐'));
});

