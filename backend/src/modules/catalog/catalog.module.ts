import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ProductAssetService } from './application/product-asset.service';
import { ProductService } from './application/product.service';
import { TaxonomyService } from './application/taxonomy.service';
import { AdminProductController } from './http/admin-product.controller';
import { AdminTaxonomyController } from './http/admin-taxonomy.controller';
import { CatalogController } from './http/catalog.controller';

/**
 * The catalogue: products, their assets, and the taxonomy that categorises
 * them.
 *
 * It depends on the storage port and never on a storage vendor. Orders,
 * entitlements and downloads will consume `ProductService` rather than reaching
 * into these tables themselves, which is what keeps "what is for sale" separate
 * from "who may have it".
 */
@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [AdminProductController, AdminTaxonomyController, CatalogController],
  providers: [ProductService, ProductAssetService, TaxonomyService],
  exports: [ProductService, ProductAssetService, TaxonomyService],
})
export class CatalogModule {}
