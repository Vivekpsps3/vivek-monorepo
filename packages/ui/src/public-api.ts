export { UiButtonComponent, type UiButtonVariant, type UiButtonSize } from './ui-button/ui-button.component';
export { SESSION_CONTEXT, type SessionPort } from './session-context';
export { UPDATE_NOTICE, type UpdateNotice } from './update-notice';
export { httpErrorInterceptor, silentErrorToast, SILENT_ERROR_TOAST } from './http-error.interceptor';
export { AppDatePipe, AppDateRangePipe } from './app-date.pipe';
export { MoneyPipe, MoneyAriaPipe } from './money.pipe';
export { ThemeService, type Theme } from './theme.service';
export { SuiteHubLinkComponent } from './suite-hub-link.component';
export { UiCardComponent } from './ui-card/ui-card.component';
export { UiInputComponent } from './ui-input/ui-input.component';
export { UiPageHeaderComponent } from './ui-page-header/ui-page-header.component';
export { UiSectionNavComponent, type UiSectionNavItem } from './ui-section-nav/ui-section-nav.component';
export { UiIconComponent, type UiIconName } from './ui-icon/ui-icon.component';
export { UiEmptyStateComponent } from './ui-empty-state/ui-empty-state.component';
export { UiBadgeComponent, type UiBadgeVariant } from './ui-badge/ui-badge.component';
export { UiSelectComponent, type UiSelectOption } from './ui-select/ui-select.component';
export { UiSkeletonComponent, type UiSkeletonVariant } from './ui-skeleton/ui-skeleton.component';
export { UiDataTableComponent } from './ui-data-table/ui-data-table.component';
export { UiDialogComponent } from './ui-dialog/ui-dialog.component';
export {
  chartPalette,
  CHART_COLORS,
  chartColorAt,
  chartSliceBorder,
  chartTextMuted,
  chartAccentColor,
  chartSuccessColor,
  chartDangerColor,
  chartGridColor,
  chartTooltipTheme,
  chartLegendBottom,
  chartCartesianScales,
} from './chart-theme';
export { UiConfirmDialogComponent } from './ui-confirm-dialog/ui-confirm-dialog.component';
export { ConfirmService, type ConfirmState } from './confirm.service';
export { ToastService, type ToastAction, type ToastKind, type ToastPayload } from './toast.service';
export {
  HTTP_ERROR_FALLBACK,
  TOAST_ACTION_DURATION_MS,
  TOAST_DURATION_MS,
  TOAST_INSET_PX,
  TOAST_LIMIT,
  TOAST_MAX_WIDTH_PX,
  failureCopy,
  httpErrorMessage,
  successCopy,
  toastDuration,
  toastLive,
  toastRole,
} from './toast-contract';
export { UiFieldComponent, UiFieldControlDirective } from './ui-field/ui-field.component';
export {
  applyThemePreference,
  bindSystemTheme,
  readThemeChoice,
  readThemePreference,
  resolveThemeChoice,
  setThemePreference,
  systemTheme,
  type ThemeChoice,
  type UiTheme,
} from './theme-preference';

export { authGuard, adminGuard } from './auth.guard';
export { authNavigation, safeNextPathFrom, safeNextPath, authPath, loginHref, afterAuthUrl, continueAfterAuth } from './after-auth';

export { UserMenuContent } from './user-menu-content';
