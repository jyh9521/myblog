(function () {
  const accounts = document.createElement('a'); accounts.textContent = '游戏平台账号'; accounts.href = '/sveltia/accounts.html'; accounts.target = '_blank'; accounts.rel = 'noopener noreferrer';
  accounts.style.cssText = 'position:fixed;right:18px;bottom:70px;z-index:99999;padding:10px 16px;border-radius:10px;border:1px solid #777;background:#24282e;color:#fff;font:14px system-ui;text-decoration:none;box-shadow:0 3px 15px #0004';
  document.body.append(accounts);
  const button = document.createElement('button'); button.type = 'button'; button.textContent = '发布状态 / 图片资源';
  button.setAttribute('aria-label', '打开博客维护工具');
  button.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;padding:10px 16px;border-radius:10px;border:1px solid #777;background:#24282e;color:#fff;cursor:pointer;font:14px system-ui;box-shadow:0 3px 15px #0004';
  button.onclick = () => {
    const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', '博客维护工具'); dialog.style.cssText = 'width:min(1100px,94vw);height:85vh;padding:0;border:1px solid #777;border-radius:14px;overflow:hidden';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭维护工具'; close.style.cssText = 'position:absolute;right:12px;top:6px;z-index:2;padding:7px;cursor:pointer'; close.onclick = () => dialog.close();
    const frame = document.createElement('iframe'); frame.src = '/sveltia/maintenance.html'; frame.title = '发布状态与图片资源'; frame.style.cssText = 'width:100%;height:100%;border:0;padding-top:36px;box-sizing:border-box';
    dialog.append(close, frame); dialog.onclose = () => { dialog.remove(); button.focus(); }; document.body.append(dialog); dialog.showModal();
  };
  document.body.append(button);
})();
