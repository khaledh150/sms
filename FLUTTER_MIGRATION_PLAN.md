# Flutter Migration Plan — Wonder Kids SME

## Architecture

| Layer | Choice | Reason |
|-------|--------|--------|
| State management | **Riverpod 2.x** | AsyncNotifier maps to React Query pattern; code-gen reduces boilerplate |
| Navigation | **GoRouter 14.x** | Declarative routing, redirect guards, deep linking for `/apply/:token` |
| Backend | **supabase_flutter** | Nearly identical API to JS SDK |
| i18n | **Flutter ARB + intl** | Built-in, 550 keys manageable |
| Charts | **fl_chart** | Replaces Recharts |
| QR scanning | **mobile_scanner** | Works on iOS/Android/web |
| QR generation | **qr_flutter** | Replaces react-qr-code |
| Animations | Built-in | AnimatedContainer, Hero, SlideTransition |
| Icons | **heroicons_flutter** or **lucide_icons** | Direct port |

## Recommended Structure

```
lib/
  core/
    supabase_client.dart
    theme.dart
    constants.dart
    router.dart
  features/
    auth/
      login_page.dart
      auth_provider.dart
      admin_guard.dart
    attendance/
      attendance_page.dart
      qr_scanner_widget.dart
      student_grid.dart
      course_modal.dart
    students/
      students_list_page.dart
      student_profile_page.dart
      widgets/ (edit_modal, delete_modal, add_course_modal, renew_modal, late_checkin_modal)
    courses/
      courses_page.dart
    admissions/
      admissions_page.dart
      step_widgets/
    inbox/
      inbox_page.dart
    billing/
      billing_page.dart
    reports/
      reports_page.dart
    messaging/
      messaging_page.dart
      chat_view.dart
      unlinked_accounts.dart
      settings_modal.dart
      templates_modal.dart
      broadcast_modal.dart
    settings/
      settings_page.dart
    home/
      home_page.dart
      feed_section.dart
      stats_cards.dart
  shared/
    widgets/
      glass_card.dart
      gummy_button.dart
      search_input.dart
      toast_overlay.dart
      offline_banner.dart
    utils/
      haptic.dart
      sounds.dart
      file_validation.dart
  l10n/
    app_en.arb
    app_th.arb
```

## Screen Inventory

| # | Screen | Complexity | Key Challenges |
|---|--------|------------|----------------|
| 1 | Login | Simple | Supabase auth |
| 2 | Dashboard/Home | Medium | Stats cards, check-in feed, realtime |
| 3 | Attendance | **Complex** | QR scanner, student grid, hour picker, bulk check-in, realtime |
| 4 | Students List | Medium | Active/inactive tabs, search, CSV import/export |
| 5 | Student Profile | **Complex** | 6 modal dialogs, LINE linking, attendance history, QR display |
| 6 | Admissions | **Complex** | Multi-step wizard, file upload, schedule picker |
| 7 | Courses | Medium | CRUD with day/time/package config |
| 8 | Inbox | Medium | Application review, approval/rejection, receipt viewer |
| 9 | Billing | Medium | Income/expense, payment recording, monthly summary |
| 10 | Reports | Medium | Line + pie charts, date filtering, CSV export |
| 11 | Messaging | **Complex** | LINE OA integration, templates, unlinked accounts, chat |
| 12 | Settings | Medium | User management, LINE config |
| 13 | More | Simple | Navigation + logout |
| 14 | Layout (shell) | Medium | Header, bottom nav, notifications, profile modal |
| 15 | Public Apply | Medium | Shared with admissions |

## Dependency Mapping

| JS | Flutter | Notes |
|----|---------|-------|
| `@supabase/supabase-js` | `supabase_flutter` | Nearly identical API |
| `@tanstack/react-query` | `riverpod` AsyncNotifier | Different paradigm, same purpose |
| `react-router-dom` | `go_router` | Declarative routing |
| `framer-motion` | Built-in animations | No extra package needed |
| `@headlessui/react` | Material/Cupertino widgets | Dialogs, menus, transitions |
| `@heroicons/react` | `heroicons_flutter` | Direct port |
| `tailwindcss` | Custom `ThemeData` | Manual but straightforward |
| `recharts` | `fl_chart` | Feature-rich |
| `html5-qrcode` | `mobile_scanner` | Better native support |
| `qrcode` / `react-qr-code` | `qr_flutter` | QR generation |
| `i18next` | `flutter_localizations` + ARB | Built-in |
| `dayjs` | Built-in `DateTime` + `intl` | No package needed |

## Design System Translation

| Current (Tailwind/CSS) | Flutter |
|------------------------|---------|
| `POS.primary` colors | `ThemeData.colorScheme` + custom `AppColors` |
| `rounded-[2rem]` | `BorderRadius.circular(32)` |
| `shadow-sm/md/lg` | `BoxShadow` in `BoxDecoration` |
| `glass-card` (backdrop blur) | `BackdropFilter` + `ClipRRect` |
| `btn-gummy` (spring) | `GestureDetector` + `AnimationController` with spring |
| `font-bouncy` | Custom `TextTheme` |
| Responsive grid | `GridView.builder` + `LayoutBuilder` |
| `motion.button whileTap` | `InkWell` + `ScaleTransition` |
| `AnimatePresence` | `AnimatedSwitcher` |

## Platform Considerations

| Feature | Web | iOS | Android | Windows |
|---------|-----|-----|---------|---------|
| QR scanning | Web camera | Native | Native | Limited |
| Push notifications | N/A | APNs/FCM | FCM | N/A |
| File upload | Standard | Photo library | Photo library | File dialog |
| Printing | Browser | AirPrint | Cloud Print | Direct |
| Haptic feedback | Limited | Full | Full | None |
| Offline storage | IndexedDB/Drift | SQLite | SQLite | SQLite |
| Installation | PWA | App Store | Play Store | MSIX |

Windows desktop is the weakest target. Consider web-only for desktop.

## Migration Phases

### Phase 1: Foundation (Weeks 1-2)
- Project setup, Riverpod, GoRouter, Supabase client
- Theme system (AppColors, TextTheme, shared widgets)
- Auth flow (login, protected routes, admin guards)
- i18n setup with ARB files (550 keys)
- Shared widgets: GlassCard, GummyButton, SearchInput, ToastOverlay

### Phase 2: Core Screens (Weeks 3-5)
- Layout shell (bottom nav, header with clock, notifications dropdown)
- Dashboard/Home page (stats cards, feed, approval banner)
- Students list + Student profile (decomposed into widget files)
- Attendance page + QR scanning

### Phase 3: Admin Screens (Weeks 6-7)
- Admissions wizard (multi-step)
- Inbox (approval/review)
- Courses CRUD

### Phase 4: Secondary Screens (Weeks 8-9)
- Billing page
- Reports page (fl_chart)
- Messaging/LINE integration (chat, templates, unlinked accounts)
- Settings page

### Phase 5: Polish & Platform (Weeks 10-12)
- Offline support (Drift/SQLite local cache)
- Push notifications (FCM)
- Platform-specific adaptations
- Testing, bug fixes, performance optimization
- App Store / Play Store submission

**Total: ~12 weeks (solo dev who knows Flutter), ~16 weeks if learning Flutter**

## Risk Assessment

### High Risk
1. **Framer Motion animations** — "gummy" spring animations and floating blobs need manual Flutter animation work
2. **Glass/blur effects** — `BackdropFilter` is expensive on Android, may need simplification
3. **StudentProfilePage (900 lines, 6 modals)** — needs careful decomposition into widget classes
4. **Supabase Realtime** — Flutter SDK's realtime is less battle-tested than JS

### Medium Risk
5. CSS-to-Flutter layout translation (no 1:1 Tailwind mapping)
6. QR scanning reliability across platforms
7. LINE messaging (edge functions are platform-agnostic, so this is mostly UI)

### Low Risk
8. Supabase CRUD (nearly identical Dart API)
9. i18n (mature ARB system)
10. Auth flow (supabase_flutter handles session persistence)

## Recommendation

Start with **Attendance + Student Profile** pages first. They're the most complex and most-used. If they feel right in Flutter, the rest follows. If problems emerge (animation fidelity, QR scanning, realtime), you discover them early.
