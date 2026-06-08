// popup.js — Browser Pilot 弹出界面逻辑

const SERVER = "http://127.0.0.1:19789";

function updateStatus() {
    // 检查服务状态
    fetch(`${SERVER}/health`)
        .then(resp => resp.json())
        .then(data => {
            document.getElementById('server-status').textContent = '在线';
            document.getElementById('server-status').className = 'status-value online';
            document.getElementById('active-tabs').textContent = data.tabs_active || 0;
        })
        .catch(() => {
            document.getElementById('server-status').textContent = '离线';
            document.getElementById('server-status').className = 'status-value offline';
            document.getElementById('active-tabs').textContent = '-';
        });
}

document.getElementById('check-btn').addEventListener('click', updateStatus);

// 初始加载
updateStatus();
setInterval(updateStatus, 3000);
