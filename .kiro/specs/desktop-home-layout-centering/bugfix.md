# Bugfix Requirements Document

## Introduction

This document addresses a layout centering issue in the home view on desktop screens. When users reload the platform on desktop, the home view interface (featuring 5 feature tabs and the "Chào mừng bạn đến TVU Connect" welcome text) appears at the top of the page instead of being vertically centered. The content is horizontally centered using `max-w-4xl mx-auto` and has a 2-column grid layout on desktop (`grid-cols-1 md:grid-cols-2`), but lacks vertical centering because the main container (`<main>` tag at line 1375) uses `min-h-[calc(100dvh-5rem)]` without flex centering properties.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the home view is displayed on desktop screens (md breakpoint and above) THEN the content appears at the top of the viewport with only `py-4 md:py-12` padding

1.2 WHEN the main container renders the home view THEN it uses `min-h-[calc(100dvh-5rem)]` without flex display or vertical centering properties

1.3 WHEN users reload the platform on desktop THEN the 5 feature cards and welcome text are positioned at the top instead of being vertically centered in the available viewport height

### Expected Behavior (Correct)

2.1 WHEN the home view is displayed on desktop screens (md breakpoint and above) THEN the content SHALL be vertically and horizontally centered within the viewport

2.2 WHEN the main container renders the home view THEN it SHALL apply flex centering properties (flex, items-center, justify-center) to vertically center the content

2.3 WHEN users reload the platform on desktop THEN the 5 feature cards and welcome text SHALL appear in the middle of the viewport, creating a balanced and visually appealing layout

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the home view is displayed on mobile screens (below md breakpoint) THEN the system SHALL CONTINUE TO display content with the current layout and spacing

3.2 WHEN other views (profile, matching, chat, conversations, settings, posts, explore, documents, results) are displayed THEN the system SHALL CONTINUE TO render with their existing layout properties

3.3 WHEN the home view grid layout renders THEN the system SHALL CONTINUE TO use `max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center` for horizontal centering and responsive column layout

3.4 WHEN the main container renders non-home views THEN the system SHALL CONTINUE TO apply the existing padding classes `px-4 sm:px-6 lg:px-8 py-4 md:py-12`

3.5 WHEN the explore view is rendered THEN the system SHALL CONTINUE TO exclude padding as specified in the conditional className logic
