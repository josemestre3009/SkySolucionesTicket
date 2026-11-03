import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { UpdateWispHubSettingsDto } from './wisphub.dto';

type WispHubClient = {
  id_servicio?: number; nombre?: string; email?: string; cedula?: string; direccion?: string;
  localidad?: string; ciudad?: string; telefono?: string; ip?: string; estado?: string;
  coordenadas?: string; comentarios?: string; costo_instalacion?: string; plan_internet?: { nombre?: string }; zona?: { nombre?: string };
};

@Injectable()
export class WispHubService {
  constructor(private prisma: PrismaService) {}

  async publicSettings() {
    const settings = await this.getSettings();
    return { baseUrl: settings.baseUrl, enabled: settings.enabled, apiKeyConfigured: Boolean(settings.apiKeyEncrypted), updatedAt: settings.updatedAt };
  }

  async status() {
    const settings = await this.getSettings();
    return { enabled: settings.enabled && Boolean(settings.apiKeyEncrypted) };
  }

  async update(dto: UpdateWispHubSettingsDto) {
    const baseUrl = this.validateBaseUrl(dto.baseUrl);
    const existing = await this.getSettings();
    const apiKeyEncrypted = dto.apiKey?.trim() ? this.encrypt(this.normalizeKey(dto.apiKey)) : existing.apiKeyEncrypted;
    if (dto.enabled && !apiKeyEncrypted) throw new BadRequestException('Configure una API key antes de activar WispHub.');
    await this.prisma.wispHubSettings.upsert({ where: { id: 'default' }, update: { baseUrl, enabled: dto.enabled, apiKeyEncrypted }, create: { id: 'default', baseUrl, enabled: dto.enabled, apiKeyEncrypted } });
    return this.publicSettings();
  }

  async lookupByIp(ip: string) {
    const settings = await this.getSettings();
    if (!settings.enabled || !settings.apiKeyEncrypted) throw new ServiceUnavailableException('La integración con WispHub no está configurada.');
    const url = new URL('clientes/', this.validateBaseUrl(settings.baseUrl));
    url.searchParams.set('ip', ip);
    url.searchParams.set('limit', '2');
    const response = await this.request(url, this.decrypt(settings.apiKeyEncrypted));
    const body = await response.json() as { count?: number; results?: WispHubClient[] };
    const client = body.results?.find((item) => item.ip === ip) ?? body.results?.[0];
    if (!client) return { found: false, ip };
    return { found: true, client: this.mapClient(client, ip) };
  }

  async installations() {
    const settings = await this.getSettings();
    if (!settings.enabled || !settings.apiKeyEncrypted) throw new ServiceUnavailableException('La integración con WispHub no está configurada.');
    const apiKey = this.decrypt(settings.apiKeyEncrypted);
    const installations: WispHubClient[] = [];
    let url: URL | null = new URL('instalaciones/?limit=300', this.validateBaseUrl(settings.baseUrl));
    while (url) {
      const response = await this.request(url, apiKey);
      const body = await response.json() as { next?: string | null; results?: WispHubClient[] };
      installations.push(...(body.results ?? []));
      url = body.next ? new URL(body.next.replace(/^http:/, 'https:')) : null;
      if (url && (url.protocol !== 'https:' || url.hostname !== 'api.wisphub.net')) throw new BadGatewayException('WispHub devolvió una paginación inválida.');
    }
    return installations.map((client) => this.mapClient(client));
  }

  async test() {
    const settings = await this.getSettings();
    if (!settings.apiKeyEncrypted) throw new BadRequestException('API key no configurada.');
    const url = new URL('instalaciones/', this.validateBaseUrl(settings.baseUrl));
    url.searchParams.set('limit', '1');
    await this.request(url, this.decrypt(settings.apiKeyEncrypted));
    return { ok: true, message: 'Conexión con WispHub exitosa.' };
  }

  private getSettings() { return this.prisma.wispHubSettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } }); }

  private async request(url: URL, apiKey: string) {
    try {
      const response = await fetch(url, { headers: { Authorization: `Api-Key ${apiKey}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
      if (response.status === 401 || response.status === 403) throw new BadRequestException('WispHub rechazó la API key o no autorizó este endpoint.');
      if (!response.ok) throw new BadGatewayException(`WispHub respondió HTTP ${response.status}.`);
      return response;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('No fue posible conectar con WispHub.');
    }
  }

  private validateBaseUrl(value: string) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !(url.hostname === 'wisphub.net' || url.hostname.endsWith('.wisphub.net'))) throw new BadRequestException('La URL debe usar HTTPS y pertenecer a wisphub.net.');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.toString();
  }

  private normalizeKey(value: string) { return value.trim().replace(/^Api-Key\s+/i, ''); }
  private mapClient(client: WispHubClient, fallbackIp = '') {
    const coordinates = this.coordinates(client.coordenadas);
    return { serviceId: client.id_servicio, name: client.nombre ?? '', phone: client.telefono ?? '', email: client.email ?? '', document: client.cedula ?? '', address: client.direccion ?? '', population: client.ciudad ?? '', ip: client.ip ?? fallbackIp, status: client.estado ?? '', plan: client.plan_internet?.nombre ?? '', installationCost: client.costo_instalacion ?? '', zone: client.zona?.nombre ?? '', comments: client.comentarios ?? '', coordinates, mapUrl: coordinates ? `https://www.google.com/maps?q=${encodeURIComponent(coordinates)}` : null };
  }
  private coordinates(value?: string) { const match = value?.match(/-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?/); return match?.[0].replace(/\s+/g, '') ?? null; }
  private key() { return createHash('sha256').update(process.env.WISPHUB_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? '').digest(); }
  private encrypt(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.'); }
  private decrypt(value: string) { const [iv, tag, encrypted] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8'); }
}
