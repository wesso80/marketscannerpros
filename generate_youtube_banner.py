"""
Generate YouTube Banner for MarketScanner Pro
Minimum: 1024 x 576 pixels
Recommended: 2048 x 1152 pixels
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Image dimensions (YouTube recommended)
WIDTH = 2048
HEIGHT = 1152

# Colors
BG_COLOR = (15, 23, 42)  # #0F172A - Dark blue background
WHITE = (255, 255, 255)
GREEN = (16, 185, 129)  # #10B981 - Accent green

def create_banner():
    # Create image
    img = Image.new('RGB', (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    # Try to load fonts, fall back to default if not available
    try:
        # Try system fonts
        title_font = ImageFont.truetype("arial.ttf", 120)
        subtitle_font = ImageFont.truetype("arial.ttf", 60)
        logo_font = ImageFont.truetype("arial.ttf", 30)
    except:
        try:
            title_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 120)
            subtitle_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 60)
            logo_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 30)
        except:
            # Use default font if arial not available
            title_font = ImageFont.load_default()
            subtitle_font = ImageFont.load_default()
            logo_font = ImageFont.load_default()
    
    # Draw logo placeholder (house with chart icon simulation)
    logo_x, logo_y = 200, 300
    logo_size = 150
    
    # Simple house shape
    house_points = [
        (logo_x + logo_size//2, logo_y),  # Top
        (logo_x + logo_size, logo_y + logo_size//2),  # Right
        (logo_x + logo_size, logo_y + logo_size),  # Bottom right
        (logo_x, logo_y + logo_size),  # Bottom left
        (logo_x, logo_y + logo_size//2),  # Left
    ]
    draw.polygon(house_points, fill=(59, 130, 246), outline=WHITE)  # Blue house
    
    # Sun/lightbulb circle
    sun_x, sun_y = logo_x + logo_size - 20, logo_y - 20
    draw.ellipse([sun_x - 40, sun_y - 40, sun_x + 40, sun_y + 40], fill=(250, 204, 21))  # Yellow
    
    # Chart bars inside house
    bar_width = 20
    bar_x_start = logo_x + 30
    bar_heights = [40, 60, 50, 80]
    for i, h in enumerate(bar_heights):
        x = bar_x_start + i * (bar_width + 8)
        y = logo_y + logo_size - h - 20
        color = GREEN if i == len(bar_heights) - 1 else (239, 68, 68)  # Green for last, red for others
        draw.rectangle([x, y, x + bar_width, logo_y + logo_size - 20], fill=color)
    
    # Logo text
    draw.text((logo_x - 30, logo_y + logo_size + 20), "MarketScanner", fill=WHITE, font=logo_font)
    draw.text((logo_x + 50, logo_y + logo_size + 55), "PRO", fill=GREEN, font=logo_font)
    
    # Main title
    title = "MarketScanner Pro"
    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_width = title_bbox[2] - title_bbox[0]
    title_x = (WIDTH - title_width) // 2
    title_y = 450
    draw.text((title_x, title_y), title, fill=WHITE, font=title_font)
    
    # Subtitle
    subtitle = "Phase-Based Market Intelligence"
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
    subtitle_x = (WIDTH - subtitle_width) // 2
    subtitle_y = 600
    draw.text((subtitle_x, subtitle_y), subtitle, fill=GREEN, font=subtitle_font)
    
    # Save image
    output_path = os.path.join(os.path.dirname(__file__), "youtube_banner.png")
    img.save(output_path, "PNG", quality=95)
    print(f"✅ Banner saved to: {output_path}")
    print(f"   Size: {WIDTH} x {HEIGHT} pixels")
    return output_path

if __name__ == "__main__":
    create_banner()
