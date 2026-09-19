
def write_file(filepath, content):
    with open(filepath, 'w') as f:
        f.write(content)

# Functionality for fetching and saving GitHub pet sprites
import os
import requests

assets_dir = 'assets'
current_pet_dir = os.path.join(assets_dir, 'current_pet')

# Create directories if they don't exist
if not os.path.exists(assets_dir):
    os.makedirs(assets_dir)
if not os.path.exists(current_pet_dir):
    os.makedirs(current_pet_dir)

image_urls = {
    'idle.png': 'https://raw.githubusercontent.com/githubocto/charliecat/main/imgs/charliecat_idle.png',
    'walk.png': 'https://raw.githubusercontent.com/githubocto/charliecat/main/imgs/charliecat_walk.png',
    'sit.png': 'https://raw.githubusercontent.com/githubocto/charliecat/main/imgs/charliecat_sit.png',
    'play.png': 'https://raw.githubusercontent.com/githubocto/charliecat/main/imgs/charliecat_play.png',
    'rest.png': 'https://raw.githubusercontent.com/githubocto/charliecat/main/imgs/charliecat_rest.png'
}

def fetch_sprite(sprite_url, filepath):
    response = requests.get(sprite_url)
    if response.status_code == 200:
        with open(filepath, 'wb') as f:
            f.write(response.content)
        print(f"Successfully fetched {sprite_url}")
    else:
        print(f"Failed to fetch {sprite_url}, Status code: {response.status_code}")

# Fetch and save each sprite
for sprite, url in image_urls.items():
    local_filepath = os.path.join(current_pet_dir, sprite)
    fetch_sprite(url, local_filepath)
