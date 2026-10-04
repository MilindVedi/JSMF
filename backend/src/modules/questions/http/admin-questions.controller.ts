import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../identity/application/auth.service";
import { QuestionImportService } from "../application/question-import.service";
import { ImportQuestionsDto } from "./dto/questions.dto";

@ApiTags("admin: pyq")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin/pyq/questions")
export class AdminQuestionsController {
  constructor(private readonly importer: QuestionImportService) {}

  @Post("import")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Import questions (idempotent on externalKey; taxonomy upserted by slug)",
  })
  import(
    @Body() dto: ImportQuestionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.importer.import(dto, user.id);
  }
}
