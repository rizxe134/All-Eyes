/**
 * All Eyes phosphor grade.
 * Always-on post process: green monochrome, a few posterized steps,
 * chunky pixels, and scanlines. Other sensor looks still run first;
 * this grade is what the screen finally shows.
 */
export const phosphorShader = {
  name: 'phosphor',
  fragmentShader: /* glsl */ `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    in vec2 v_textureCoordinates;

    void main() {
      vec2 dims = max(colorTextureDimensions, vec2(1.0));
      float block = 3.0;
      vec2 pixel = v_textureCoordinates * dims;
      vec2 snapped = (floor(pixel / block) * block + block * 0.5) / dims;
      snapped = clamp(snapped, vec2(0.0), vec2(1.0));
      vec3 src = texture(colorTexture, snapped).rgb;
      float luma = dot(src, vec3(0.25, 0.68, 0.07));
      luma = pow(clamp(luma, 0.0, 1.0), 0.8);
      float levels = 7.0;
      luma = floor(luma * levels) / (levels - 1.0);
      vec3 dark = vec3(0.012, 0.055, 0.02);
      vec3 mid = vec3(0.08, 0.55, 0.16);
      vec3 hot = vec3(0.72, 1.0, 0.45);
      vec3 phosphor = luma < 0.55
        ? mix(dark, mid, luma / 0.55)
        : mix(mid, hot, (luma - 0.55) / 0.45);
      float row = floor(pixel.y);
      float scan = mod(row, 3.0) < 1.0 ? 0.72 : 1.0;
      vec2 cell = mod(floor(pixel), block);
      float grid = (cell.x < 1.0 || cell.y < 1.0) ? 0.78 : 1.0;
      phosphor *= scan * grid;
      out_FragColor = vec4(phosphor, 1.0);
    }
  `,
};
