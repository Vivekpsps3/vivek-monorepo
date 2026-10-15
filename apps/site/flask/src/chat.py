import requests
import json
import time
import sys
import asyncio
import aiohttp
import os
from pathlib import Path


class GitHubCopilotChat:
    MODELS = [
        "gpt-4o",
        "o1",
        "gemini-2.0-flash-001",
        "claude-3.5-sonnet",
        "claude-3.7-sonnet",
        "claude-3.7-sonnet-thought",
        "o3-mini",
    ]

    def __init__(self, model="claude-3.7-sonnet", token_file=None):
        self.model = model
        config_root_value = os.environ.get("XDG_CONFIG_HOME")
        config_root = Path(config_root_value).expanduser() if config_root_value else Path.home() / ".config"
        if not config_root.is_absolute():
            config_root = Path.home() / ".config"
        self.token_file = Path(token_file).expanduser() if token_file else config_root / "vivek-site" / "copilot-token"
        self.token = None
        self.messages = []

    def setup(self):
        resp = requests.post('https://github.com/login/device/code', headers={
                'accept': 'application/json',
                'editor-version': 'Neovim/0.6.1',
                'editor-plugin-version': 'copilot.vim/1.16.0',
                'content-type': 'application/json',
                'user-agent': 'GithubCopilot/1.155.0',
                'accept-encoding': 'gzip,deflate,br'
            }, data='{"client_id":"Iv1.b507a08c87ecfe98","scope":"read:user"}', timeout=15)
        resp.raise_for_status()

        resp_json = resp.json()
        device_code = resp_json.get('device_code')
        user_code = resp_json.get('user_code')
        verification_uri = resp_json.get('verification_uri')

        print(f'Please visit {verification_uri} and enter code {user_code} to authenticate.')

        while True:
            time.sleep(5)
            resp = requests.post('https://github.com/login/oauth/access_token', headers={
                'accept': 'application/json',
                'editor-version': 'Neovim/0.6.1',
                'editor-plugin-version': 'copilot.vim/1.16.0',
                'content-type': 'application/json',
                'user-agent': 'GithubCopilot/1.155.0',
                'accept-encoding': 'gzip,deflate,br'
                }, data=f'{{"client_id":"Iv1.b507a08c87ecfe98","device_code":"{device_code}","grant_type":"urn:ietf:params:oauth:grant-type:device_code"}}', timeout=15)
            resp.raise_for_status()

            resp_json = resp.json()
            access_token = resp_json.get('access_token')

            if access_token:
                break

        self.token_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(self.token_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w") as token_handle:
            token_handle.write(access_token)
        os.chmod(self.token_file, 0o600)

        print('Authentication success!')

    def get_token(self):
        try:
            access_token = self.token_file.read_text().strip()
        except FileNotFoundError as error:
            raise RuntimeError(
                "GitHub Copilot authorization is missing; run `python -m src.chat` interactively first."
            ) from error
        if not access_token:
            raise RuntimeError("The GitHub Copilot authorization file is empty.")

        resp = requests.get('https://api.github.com/copilot_internal/v2/token', headers={
            'authorization': f'token {access_token}',
            'editor-version': 'Neovim/0.6.1',
            'editor-plugin-version': 'copilot.vim/1.16.0',
            'user-agent': 'GithubCopilot/1.155.0'
        }, timeout=15)
        resp.raise_for_status()

        resp_json = resp.json()
        self.token = resp_json.get('token')
        if not self.token:
            raise RuntimeError("The chat provider did not return an access token.")

    async def chat(self, message, model=None):
        if self.token is None:
            await asyncio.to_thread(self.get_token)

        stateful_conversation = isinstance(message, str)
        if stateful_conversation:
            conversation = [
                *self.messages,
                {"content": message, "role": "user"},
            ]
        else:
            # API requests carry their own conversation. Copy it so overlapping
            # requests never share or append to mutable instance message state.
            conversation = [dict(item) for item in message]

        selected_model = model if model in self.MODELS else self.model

        try:
            timeout = aiohttp.ClientTimeout(total=120, connect=15, sock_read=90)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    'https://api.githubcopilot.com/chat/completions',
                    headers={
                        'authorization': f'Bearer {self.token}',
                        'Editor-Version': 'vscode/1.80.1',
                    },
                    json={
                        'intent': False,
                        'model': selected_model,
                        'temperature': 0,
                        'top_p': 1,
                        'n': 1,
                        'stream': True,
                        'messages': conversation
                    }
                ) as resp:
                    if resp.status < 200 or resp.status >= 300:
                        raise RuntimeError("The chat provider returned an error response.")
                    result = ''
                    async for line in resp.content:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: {'):
                            json_completion = json.loads(line_text[6:])
                            try:
                                completion = json_completion.get('choices')[0].get('delta').get('content')
                                if completion:
                                    result += completion
                                else:
                                    result += '\n'
                            except:
                                pass

                    if result == "":
                        raise RuntimeError("The chat provider returned an empty response.")

                    if stateful_conversation:
                        self.messages = [
                            *conversation,
                            {"content": result, "role": "assistant"},
                        ]

                    return result
        except Exception:
            raise RuntimeError("The chat provider request failed.") from None

    def get_models_list(self):
        return self.MODELS

    def set_model(self, model):
        if model in self.MODELS:
            self.model = model
            return True
        return False


def main():
    async def run_chat():
        chat_bot = GitHubCopilotChat()
        chat_bot.setup()
        while True:
            user_input = input('>>> ')
            response = await chat_bot.chat(user_input)
            print(response)

    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    asyncio.run(run_chat())


if __name__ == '__main__':
    main()
