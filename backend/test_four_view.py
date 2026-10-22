import os
import sys
sys.path.insert(0, '.')
os.environ['AI_PROVIDER'] = 'openai'
os.environ['OPENAI_API_KEY'] = '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'
os.environ['OPENAI_MODEL'] = 'gpt-4o-mini'

from PIL import Image, ImageDraw
import io
import random
import hashlib
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

# Create 4 very different images
files = {}
views = ['top', 'bottom', 'left', 'right']
colors = ['red', 'blue', 'green', 'yellow']

for i, (view, color) in enumerate(zip(['top', 'bottom', 'left', 'right'], ['red', 'blue', 'green', 'yellow'])):
    img = Image.new('RGB', (640, 640), color=color)
    draw = ImageDraw.Draw(img)
    
    for j in range(50):
        x1 = random.randint(0, 580)
        y1 = random.randint(0, 580)
        x2 = x1 + random.randint(20, 120)
        y2 = y1 + random.randint(20, 120)
        color_val = (
            random.randint(0, 255),
            random.randint(0, 255),
            random.randint(0, 255)
        )
        draw.rectangle([x1, y1, x2, y2], fill=color_val, outline='black')
    
    for _ in range(5000):
        x = random.randint(0, 639)
        y = random.randint(0, 639)
        draw.point((x, y), fill=(
            random.randint(0, 255),
            random.randint(0, 255),
            random.randint(0, 255)
        ))
    
    draw = ImageDraw.Draw(img)
    draw.text((50, 50), f'{view} view', fill='white')
    
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=85)
    buf.seek(0)
    
    # Check hash
    img_bytes = buf.getvalue()
    print(f'{view}: size={len(buf.getvalue())}, md5={hashlib.md5(buf.getvalue()).hexdigest()[:16]}...')
    
    files[view] = (f'{view}.jpg', buf.getvalue(), 'image/jpeg')

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

response = client.post('/assess/four-view', files={
    'top': ('top.jpg', files['top'][1], 'image/jpeg'),
    'bottom': ('bottom.jpg', files['bottom'][1], 'image/jpeg'),
    'left': ('left.jpg', files['left'][1], 'image/jpeg'),
    'right': ('right.jpg', files['right'][1], 'image/jpeg'),
}, data={'confidence_threshold': '0.25', 'image_size': '640'})
print('4-view status:', response.status_code)
if response.status_code == 200:
    result = response.json()
    print('  Assessment ID:', result.get('assessment_id'))
    print('  Severity:', result.get('severity'))
    print('  Primary component:', result.get('primary_component'))
    print('  Settlement offer:', result.get('settlement_offer'))
    print('  Damage summary:', result.get('damage_summary')[:100] if result.get('damage_summary') else 'N/A')
else:
    print('  Error:', response.json())