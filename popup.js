document.addEventListener('DOMContentLoaded', () => {
  const btnEarth = document.getElementById('btn-earth');
  const btnGalaxy = document.getElementById('btn-galaxy');
  const btnCalc = document.getElementById('btn-calc');
  const btnSnake = document.getElementById('btn-snake');
  const btnSnake3d = document.getElementById('btn-snake3d');
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

  btnEarth.addEventListener('click', () => openPage('globe.html', '地球'));
  btnGalaxy.addEventListener('click', () => openPage('galaxy.html', '银河系'));
  btnCalc.addEventListener('click', () => openPage('calculator.html', '科学计算器'));
  btnSnake.addEventListener('click', () => openPage('snake.html', '贪吃蛇'));
  btnSnake3d.addEventListener('click', () => openPage('snake3d.html', '3D 贪吃蛇'));
});
