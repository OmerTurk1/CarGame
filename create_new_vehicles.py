import cv2
import numpy as np
import os

def arac_rengini_degistir(resim_yolu, hedef_renk_bgr):
    img = cv2.imread(resim_yolu, cv2.IMREAD_UNCHANGED)
    if img is None:
        print(f"Hata: {resim_yolu} dosyası bulunamadı!")
        return
    
    has_alpha = img.shape[2] == 4
    if has_alpha:
        bgr = img[:, :, :3]
        alpha = img[:, :, 3]
    else:
        bgr = img
        alpha = None

    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    dosya_adi = os.path.basename(resim_yolu).lower()

    if "car" in dosya_adi:
        alt_sinir = np.array([0, 0, 180])
        ust_sinir = np.array([180, 45, 255])
        maske = cv2.inRange(hsv, alt_sinir, ust_sinir)
        
    elif "truck" in dosya_adi:
        alt_kirmizi1 = np.array([0, 70, 50])
        ust_kirmizi1 = np.array([10, 255, 255])
        alt_kirmizi2 = np.array([170, 70, 50])
        ust_kirmizi2 = np.array([180, 255, 255])
        
        maske1 = cv2.inRange(hsv, alt_kirmizi1, ust_kirmizi1)
        maske2 = cv2.inRange(hsv, alt_kirmizi2, ust_kirmizi2)
        maske = cv2.bitwise_or(maske1, maske2)
        
    else:
        print("Hata: Dosya adı 'car' veya 'truck' kelimelerinden birini içermelidir!")
        return

    hedef_hsv = cv2.cvtColor(np.uint8([[hedef_renk_bgr]]), cv2.COLOR_BGR2HSV)[0][0]
    
    sonuc_hsv = hsv.copy()
    
    sonuc_hsv[maske > 0, 0] = hedef_hsv[0]
    sonuc_hsv[maske > 0, 1] = hedef_hsv[1]

    sonuc_bgr = cv2.cvtColor(sonuc_hsv, cv2.COLOR_HSV2BGR)
    
    if has_alpha:
        sonuc = cv2.merge([sonuc_bgr[:,:,0], sonuc_bgr[:,:,1], sonuc_bgr[:,:,2], alpha])
    else:
        sonuc = sonuc_bgr

    yeni_dosya_adi = "yeni_" + os.path.basename(resim_yolu)
    cv2.imwrite(yeni_dosya_adi, sonuc)
    print(f"Başarılı! Yeni resim kaydedildi: {yeni_dosya_adi}")

if __name__=="__main__":
    renkler = {
        "mavi":   {"BGR": [255, 0, 0],     "RGB": [0, 0, 255],     "HEX": "#0000FF"},
        "sari":   {"BGR": [0, 255, 255],   "RGB": [255, 255, 0],   "HEX": "#FFFF00"},
        "yesil":  {"BGR": [0, 255, 0],     "RGB": [0, 255, 0],     "HEX": "#00FF00"},
        "pembe":  {"BGR": [180, 105, 255], "RGB": [255, 105, 180], "HEX": "#FF69B4"},
        "kirmizi":{"BGR": [0, 0, 255],     "RGB": [255, 0, 0],     "HEX": "#FF0000"},
        "mor":    {"BGR": [128, 0, 128],   "RGB": [128, 0, 128],   "HEX": "#800080"},
        "siyah":  {"BGR": [0, 0, 0],       "RGB": [0, 0, 0],       "HEX": "#000000"}
    }
    arac_rengini_degistir("static/assets/truck.png", renkler["sari"]["BGR"])