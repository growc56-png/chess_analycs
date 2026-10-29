import os
import urllib.request
import ssl

# Отключаем проверку SSL, чтобы Windows не блокировал скачивание
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

folders = ['js', 'css', 'img/pieces']
for folder in folders:
    os.makedirs(folder, exist_ok=True)

files = {
    'js/jquery.min.js': 'https://code.jquery.com/jquery-3.7.1.min.js',
    'js/chessboard-1.0.0.min.js': 'https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js',
    'css/chessboard-1.0.0.min.css': 'https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.css',
    'js/chess.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js',
}

pieces = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK']
for p in pieces:
    files[f'img/pieces/{p}.png'] = f'https://chessboardjs.com/img/chesspieces/wikipedia/{p}.png'

print("Начинаю скачивание файлов...")
for path, url in files.items():
    print(f"Скачиваем {path} ...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx) as response, open(path, 'wb') as out_file:
            out_file.write(response.read())
    except Exception as e:
        print(f"ОШИБКА при скачивании {url}: {e}")

print("====================================")
print("Готово! Проверь папки js, css, img.")