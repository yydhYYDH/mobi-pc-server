import os
from PIL import Image
import cv2

def downsample_half(input_path, output_path):
    # 1. 读取图片
    img = cv2.imread(input_path)
    if img is None:
        print("图片读取失败，请检查路径")
        return

    # 2. 直接按比例缩小：(0, 0) 代表不输入固定目标尺寸
    # fx=0.5, fy=0.5 代表宽度和高度各缩小到原来的 1/2
    half_img = cv2.resize(img, (0, 0), fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)

    # 3. 保存图片
    cv2.imwrite(output_path, half_img)
    
    # 打印对比信息确认尺寸
    h, w = img.shape[:2]
    nh, nw = half_img.shape[:2]
    print(f"原尺寸: {w}x{h} -> 降采样后: {nw}x{nh}")

input_dir = 'pics'
output_dir = 'pics_output'
for name in os.listdir(input_dir):
    input_path = os.path.join(input_dir, name)
    output_path = os.path.join(output_dir, name)
    downsample_half(input_path, output_path)