"""
消息管理模块
使用 JSON 文件持久化存储聊天消息
"""
import json
import os
import time
import threading
from datetime import datetime


class MessageManager:
    """
    消息管理器 —— 负责消息的读写与存储
    数据以 JSON 文件形式保存在指定目录
    """

    def __init__(self, data_dir=None):
        """
        初始化消息管理器
        :param data_dir: 数据目录路径，默认使用程序同级目录下的 .jm_messages
        """
        if data_dir is None:
            data_dir = os.path.join(os.path.expanduser('~'), '.jm_messages')

        self.data_dir = data_dir
        self.messages_file = os.path.join(data_dir, 'messages.json')
        self._lock = threading.Lock()
        self._ensure_data_dir()

    def _ensure_data_dir(self):
        """确保数据目录存在"""
        os.makedirs(self.data_dir, exist_ok=True)
        if not os.path.exists(self.messages_file):
            self._save_messages([])

    def _load_messages(self) -> list:
        """从文件加载所有消息"""
        try:
            with open(self.messages_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _save_messages(self, messages: list):
        """将所有消息保存到文件"""
        with open(self.messages_file, 'w', encoding='utf-8') as f:
            json.dump(messages, f, ensure_ascii=False, indent=2)

    def send_message(self, sender: str, content: str, sender_ip: str = '') -> dict:
        """
        发送一条消息
        :param sender: 发送者昵称
        :param content: 消息内容
        :param sender_ip: 发送者 IP
        :return: 新创建的消息对象
        """
        content = content.strip()
        if not content:
            return None

        # 限制单条消息最大长度
        if len(content) > 5000:
            content = content[:5000]

        now = time.time()
        msg = {
            'id': int(now * 1000),
            'sender': sender or '匿名',
            'content': content,
            'sender_ip': sender_ip,
            'timestamp': now,
            'time_str': datetime.fromtimestamp(now).strftime('%Y-%m-%d %H:%M:%S'),
            'is_server': False,
        }

        with self._lock:
            messages = self._load_messages()
            messages.append(msg)
            # 保留最近 500 条消息
            if len(messages) > 500:
                messages = messages[-500:]
            self._save_messages(messages)

        return msg

    def send_server_message(self, content: str) -> dict:
        """
        服务器端发送一条消息
        :param content: 消息内容
        :return: 新创建的消息对象
        """
        content = content.strip()
        if not content:
            return None

        now = time.time()
        msg = {
            'id': int(now * 1000),
            'sender': '服务器',
            'content': content,
            'sender_ip': '127.0.0.1',
            'timestamp': now,
            'time_str': datetime.fromtimestamp(now).strftime('%Y-%m-%d %H:%M:%S'),
            'is_server': True,
        }

        with self._lock:
            messages = self._load_messages()
            messages.append(msg)
            if len(messages) > 500:
                messages = messages[-500:]
            self._save_messages(messages)

        return msg

    def get_messages(self, since_id: int = 0, limit: int = 50) -> list:
        """
        获取消息列表
        :param since_id: 从该 ID 之后的消息开始获取（用于增量拉取）
        :param limit: 最多返回条数
        :return: 消息列表
        """
        with self._lock:
            messages = self._load_messages()

        if since_id > 0:
            messages = [m for m in messages if m['id'] > since_id]

        return messages[-limit:]

    def get_all_messages(self) -> list:
        """获取全部消息"""
        with self._lock:
            return self._load_messages()
