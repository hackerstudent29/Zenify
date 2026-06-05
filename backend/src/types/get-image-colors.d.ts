declare module 'get-image-colors' {
    import { Buffer } from 'buffer';

    interface Color {
        rgb(): [number, number, number];
        hex(): string;
        hsl(): [number, number, number];
        hsv(): [number, number, number];
        cmyk(): [number, number, number, number];
        rgba(): [number, number, number, number];
        alpha(): number;
    }

    function getColors(
        buffer: Buffer | string,
        mimeType?: string
    ): Promise<Color[]>;

    export default getColors;
}
