/**
 * Utilitário para compactação e redimensionamento de imagens no cliente.
 * Ajuda a economizar espaço no banco de dados e tráfego de rede.
 */

export interface ResizeOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
}

export const ImageUtils = {
    /**
     * Redimensiona e compacta uma imagem em formato Base64 ou File.
     * Retorna uma String Base64 compactada.
     */
    async compressImage(
        source: string | File,
        options: ResizeOptions = {}
    ): Promise<string> {
        const {
            maxWidth = 1280,
            maxHeight = 1280,
            quality = 0.7
        } = options;

        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Calcular proporções
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Não foi possível obter o contexto do canvas'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Exportar como JPEG compactado
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };

            img.onerror = (err) => reject(err);

            if (source instanceof File) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.src = e.target?.result as string;
                };
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(source);
            } else {
                img.src = source;
            }
        });
    },

    /**
     * Converte uma imagem Base64 para um objeto File.
     */
    base64ToFile(base64: string, filename: string): File {
        const arr = base64.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    }
};
