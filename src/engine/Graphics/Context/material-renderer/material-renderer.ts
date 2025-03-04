import { vec } from '../../../Math/vector';
import { parseImageFiltering } from '../../Filtering';
import { GraphicsDiagnostics } from '../../GraphicsDiagnostics';
import { ImageSourceAttributeConstants } from '../../ImageSource';
import { parseImageWrapping } from '../../Wrapping';
import { HTMLImageSource } from '../ExcaliburGraphicsContext';
import { ExcaliburGraphicsContextWebGL } from '../ExcaliburGraphicsContextWebGL';
import { QuadRenderer } from '../quad-renderer';
import { RendererPlugin } from '../renderer';
import { ShaderPipeline } from '../shader-pipeline';

export class MaterialRenderer implements RendererPlugin {
  public readonly type: string = 'ex.material';
  public priority: number = 0;

  private _context!: ExcaliburGraphicsContextWebGL;
  private _textures: WebGLTexture[] = [];
  private _quadRenderer!: QuadRenderer;
  initialize(gl: WebGL2RenderingContext, context: ExcaliburGraphicsContextWebGL): void {
    this._context = context;
    this._quadRenderer = new QuadRenderer({ graphicsContext: context });
  }

  public dispose() {
    this._textures.length = 0;
    this._context = null as any;
  }

  draw(
    image: HTMLImageSource,
    sx: number,
    sy: number,
    swidth?: number,
    sheight?: number,
    dx?: number,
    dy?: number,
    dwidth?: number,
    dheight?: number
  ): void {
    // Extract context info
    const material = this._context.material;
    if (!material) {
      return;
    }

    const transform = this._context.getTransform();
    const opacity = this._context.opacity;

    // material shader
    const shader = material.getShader()!;

    // construct geometry, or hold on to it in the material?
    // geometry primitive for drawing rectangles?
    // update data
    //const vertexBuffer = this._layout.vertexBuffer.bufferData;
    //let vertexIndex = 0;

    let width = image?.width || swidth || 0;
    let height = image?.height || sheight || 0;
    let view = [0, 0, swidth ?? image?.width ?? 0, sheight ?? image?.height ?? 0];
    let dest = [sx ?? 1, sy ?? 1];
    // If destination is specified, update view and dest
    if (dx !== undefined && dy !== undefined && dwidth !== undefined && dheight !== undefined) {
      view = [sx ?? 1, sy ?? 1, swidth ?? image?.width ?? 0, sheight ?? image?.height ?? 0];
      dest = [dx, dy];
      width = dwidth;
      height = dheight;
    }

    sx = view[0];
    sy = view[1];
    const sw = view[2];
    const sh = view[3];

    const topLeft = vec(dest[0], dest[1]);
    //const topRight = vec(dest[0] + width, dest[1]);
    //const bottomLeft = vec(dest[0], dest[1] + height);
    const bottomRight = vec(dest[0] + width, dest[1] + height);

    const imageWidth = image.width || width;
    const imageHeight = image.height || height;

    const uvx0 = sx / imageWidth;
    const uvy0 = sy / imageHeight;
    const uvx1 = (sx + sw - 0.01) / imageWidth;
    const uvy1 = (sy + sh - 0.01) / imageHeight;

    const topLeftScreen = transform.getPosition();
    const bottomRightScreen = topLeftScreen.add(bottomRight);
    const screenUVX0 = topLeftScreen.x / this._context.width;
    const screenUVY0 = topLeftScreen.y / this._context.height;
    const screenUVX1 = bottomRightScreen.x / this._context.width;
    const screenUVY1 = bottomRightScreen.y / this._context.height;

    //// (0, 0) - 0
    //vertexBuffer[vertexIndex++] = topLeft.x;
    //vertexBuffer[vertexIndex++] = topLeft.y;
    //vertexBuffer[vertexIndex++] = uvx0;
    //vertexBuffer[vertexIndex++] = uvy0;
    //vertexBuffer[vertexIndex++] = screenUVX0;
    //vertexBuffer[vertexIndex++] = screenUVY0;
    //
    //// (0, 1) - 1
    //vertexBuffer[vertexIndex++] = bottomLeft.x;
    //vertexBuffer[vertexIndex++] = bottomLeft.y;
    //vertexBuffer[vertexIndex++] = uvx0;
    //vertexBuffer[vertexIndex++] = uvy1;
    //vertexBuffer[vertexIndex++] = screenUVX0;
    //vertexBuffer[vertexIndex++] = screenUVY1;
    //
    //// (1, 0) - 2
    //vertexBuffer[vertexIndex++] = topRight.x;
    //vertexBuffer[vertexIndex++] = topRight.y;
    //vertexBuffer[vertexIndex++] = uvx1;
    //vertexBuffer[vertexIndex++] = uvy0;
    //vertexBuffer[vertexIndex++] = screenUVX1;
    //vertexBuffer[vertexIndex++] = screenUVY0;
    //
    //// (1, 1) - 3
    //vertexBuffer[vertexIndex++] = bottomRight.x;
    //vertexBuffer[vertexIndex++] = bottomRight.y;
    //vertexBuffer[vertexIndex++] = uvx1;
    //vertexBuffer[vertexIndex++] = uvy1;
    //vertexBuffer[vertexIndex++] = screenUVX1;
    //vertexBuffer[vertexIndex++] = screenUVY1;

    this._quadRenderer.setPostion(topLeft, bottomRight);
    this._quadRenderer.setUV(vec(uvx0, uvy0), vec(uvx1, uvy1));
    this._quadRenderer.setScreenUV(vec(screenUVX0, screenUVY0), vec(screenUVX1, screenUVY1));

    const gl = this._context.__gl;
    // This creates and uploads the texture if not already done
    let texture = this._addImageAsTexture(image);
    // Run pipeline if exists
    if (shader instanceof ShaderPipeline) {
      // TODO uniforms
      texture = shader.draw(texture);
    } else {
      this._quadRenderer.setShader(shader);
      shader.use();
      material.uploadAndBind(gl);
    }

    shader.trySetUniformFloatColor('u_color', material.color);

    // apply time in ms since the page (performance.now())
    shader.trySetUniformFloat('u_time_ms', performance.now());

    // apply opacity
    shader.trySetUniformFloat('u_opacity', opacity);

    // apply resolution
    shader.trySetUniformFloatVector('u_resolution', vec(this._context.width, this._context.height));

    // apply graphic resolution
    shader.trySetUniformFloatVector('u_graphic_resolution', vec(imageWidth, imageHeight));

    // apply size
    shader.trySetUniformFloatVector('u_size', vec(sw, sh));

    // apply orthographic projection
    shader.trySetUniformMatrix('u_matrix', this._context.ortho);

    // apply geometry transform
    shader.trySetUniformMatrix('u_transform', transform.to4x4());

    // bind graphic image texture 'uniform sampler2D u_graphic;'
    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    shader.trySetUniformInt('u_graphic', 0);

    // bind the screen texture
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this._context.materialScreenTexture);
    shader.trySetUniformInt('u_screen_texture', 1);

    // Draw a single quad
    // Does doing a quad renderer accidentally make this batchable? maybe but for another day
    const texturesToDraw = [texture];
    if (this._context.materialScreenTexture) {
      texturesToDraw.push(this._context.materialScreenTexture);
    }
    this._quadRenderer.draw(texturesToDraw);

    GraphicsDiagnostics.DrawnImagesCount++;
    GraphicsDiagnostics.DrawCallCount++;
  }

  private _addImageAsTexture(image: HTMLImageSource) {
    const maybeFiltering = image.getAttribute(ImageSourceAttributeConstants.Filtering);
    const filtering = maybeFiltering ? parseImageFiltering(maybeFiltering) : undefined;
    const wrapX = parseImageWrapping(image.getAttribute(ImageSourceAttributeConstants.WrappingX) as any);
    const wrapY = parseImageWrapping(image.getAttribute(ImageSourceAttributeConstants.WrappingY) as any);

    const force = image.getAttribute('forceUpload') === 'true' ? true : false;
    const texture = this._context.textureLoader.load(
      image,
      {
        filtering,
        wrapping: { x: wrapX, y: wrapY }
      },
      force
    )!;
    // remove force attribute after upload
    image.removeAttribute('forceUpload');
    if (this._textures.indexOf(texture) === -1) {
      this._textures.push(texture);
    }

    return texture;
  }

  hasPendingDraws(): boolean {
    return false;
  }
  flush(): void {
    // flush does not do anything, material renderer renders immediately per draw
  }
}
