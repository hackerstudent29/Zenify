import os
from PIL import Image, ImageDraw

def main():
    src_path = 'frontend/public/favicon_transparent.png'
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source file {src_path} not found.")

    src = Image.open(src_path)
    bbox = src.getbbox()
    z_crop = src.crop(bbox) # Pristine Z logo (380x370)
    aspect = z_crop.width / z_crop.height
    print(f"Loaded Z logo crop: {z_crop.size}, aspect: {aspect:.3f}")

    def create_icon(size, bg_color=None, is_round=False, target_ratio=0.72):
        im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(im)

        if bg_color is not None:
            if is_round:
                draw.ellipse([0, 0, size - 1, size - 1], fill=bg_color)
            else:
                im.paste(bg_color, [0, 0, size, size])

        target_h = int(size * target_ratio)
        target_w = int(target_h * aspect)
        if target_w > size * target_ratio:
            target_w = int(size * target_ratio)
            target_h = int(target_w / aspect)

        z_resized = z_crop.resize((target_w, target_h), Image.Resampling.LANCZOS)
        ox = (size - target_w) // 2
        oy = (size - target_h) // 2
        im.paste(z_resized, (ox, oy), z_resized)
        return im

    black = (0, 0, 0, 255)

    # 1. Android Mipmaps
    densities = {
        'mdpi': {'legacy': 48, 'fg': 108},
        'hdpi': {'legacy': 72, 'fg': 162},
        'xhdpi': {'legacy': 96, 'fg': 216},
        'xxhdpi': {'legacy': 144, 'fg': 324},
        'xxxhdpi': {'legacy': 192, 'fg': 432},
    }

    res_base = 'mobile/android/app/src/main/res'
    for name, sizes in densities.items():
        dir_path = os.path.join(res_base, f'mipmap-{name}')
        os.makedirs(dir_path, exist_ok=True)

        leg_size = sizes['legacy']
        fg_size = sizes['fg']

        # Standard legacy icon with black background
        ic_launcher = create_icon(leg_size, bg_color=black, is_round=False, target_ratio=0.72)
        ic_launcher.save(os.path.join(dir_path, 'ic_launcher.png'))

        # Round icon with circular black background
        ic_launcher_round = create_icon(leg_size, bg_color=black, is_round=True, target_ratio=0.70)
        ic_launcher_round.save(os.path.join(dir_path, 'ic_launcher_round.png'))

        # Adaptive icon foreground with transparent background
        ic_launcher_fg = create_icon(fg_size, bg_color=None, is_round=False, target_ratio=0.48)
        ic_launcher_fg.save(os.path.join(dir_path, 'ic_launcher_foreground.png'))

        print(f"Generated mipmap-{name}: legacy={leg_size}x{leg_size}, fg={fg_size}x{fg_size}")

    # 2. Adaptive Icon XMLs & Colors
    anydpi_dir = os.path.join(res_base, 'mipmap-anydpi-v26')
    os.makedirs(anydpi_dir, exist_ok=True)

    adaptive_xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''
    with open(os.path.join(anydpi_dir, 'ic_launcher.xml'), 'w', encoding='utf-8') as f:
        f.write(adaptive_xml)
    with open(os.path.join(anydpi_dir, 'ic_launcher_round.xml'), 'w', encoding='utf-8') as f:
        f.write(adaptive_xml)

    values_dir = os.path.join(res_base, 'values')
    os.makedirs(values_dir, exist_ok=True)
    colors_xml = '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#000000</color>
</resources>
'''
    with open(os.path.join(values_dir, 'colors.xml'), 'w', encoding='utf-8') as f:
        f.write(colors_xml)
    print("Generated adaptive icon XMLs & colors.xml")

    # 3. Mobile assets images
    assets_img_dir = 'mobile/assets/images'
    os.makedirs(assets_img_dir, exist_ok=True)

    # 512x512 transparent big Z logo
    z_logo_trans = create_icon(512, bg_color=None, is_round=False, target_ratio=0.80)
    z_logo_trans.save(os.path.join(assets_img_dir, 'z_logo.png'))

    # 512x512 black background big Z logo
    z_logo_black = create_icon(512, bg_color=black, is_round=False, target_ratio=0.80)
    z_logo_black.save(os.path.join(assets_img_dir, 'z_logo_black.png'))
    print("Updated mobile/assets/images/z_logo.png and z_logo_black.png")

    # 4. Mobile web icons
    web_icons_dir = 'mobile/web/icons'
    os.makedirs(web_icons_dir, exist_ok=True)

    for sz in [192, 512]:
        icon_web = create_icon(sz, bg_color=black, is_round=False, target_ratio=0.72)
        icon_web.save(os.path.join(web_icons_dir, f'Icon-{sz}.png'))
        icon_maskable = create_icon(sz, bg_color=black, is_round=False, target_ratio=0.55)
        icon_maskable.save(os.path.join(web_icons_dir, f'Icon-maskable-{sz}.png'))

    fav = create_icon(32, bg_color=black, is_round=False, target_ratio=0.72)
    fav.save('mobile/web/favicon.png')
    print("Updated mobile/web/icons and favicon.png")

    # 5. Windows runner icon
    win_res_dir = 'mobile/windows/runner/resources'
    if os.path.exists(win_res_dir):
        ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        ico_img = create_icon(256, bg_color=black, is_round=False, target_ratio=0.75)
        ico_img.save(os.path.join(win_res_dir, 'app_icon.ico'), sizes=ico_sizes)
        print("Updated mobile/windows/runner/resources/app_icon.ico")

    print("\nAll Zenify mobile icons successfully generated!")

if __name__ == '__main__':
    main()

