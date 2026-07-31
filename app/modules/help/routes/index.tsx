/**
 * HELP-01 — the in-app Help route.
 *
 * A real guidance surface, replacing the PX-03 "Coming Soon" placeholder. It uses
 * the ordinary DalyHub page layout and theme tokens, so Help looks like the rest of
 * the product in all five themes rather than like a documentation site bolted on.
 *
 * Structure: a contents rail (the sections and their topics) beside the topics
 * themselves. Every topic is a real heading with a stable anchor id, so:
 *   - the contents links are ordinary in-page anchors that work without JavaScript;
 *   - an empty state anywhere in the product can deep-link to the paragraph that
 *     explains it (`/help?topic=<id>`, built by `helpTopicHref`);
 *   - browser Find works across the whole page, which is what people actually do.
 *
 * On a phone the rail moves above the content and the whole page is one column, so
 * Help needs no separate mobile design.
 *
 * The content itself lives in `../help-content.ts` — see that file for the rules it
 * follows (describe the product as it is, owner language, name what is missing).
 */

import { resolveHelpTopicId, HELP_SECTIONS } from "../help-content";
import type { HelpBlock, HelpTopic } from "../help-content";

import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Help · DalyHub" },
    { name: "description", content: "How DalyHub works, in plain language." },
  ];
}

export function loader({ request }: Route.LoaderArgs) {
  // A `?topic=` deep link is validated against the content, so a stale or
  // hand-edited link opens Help rather than pointing at nothing.
  const requested = new URL(request.url).searchParams.get("topic");
  return { focusTopicId: resolveHelpTopicId(requested) };
}

export default function HelpRoute({ loaderData }: Route.ComponentProps) {
  const { focusTopicId } = loaderData;

  return (
    <div className="dh-help">
      <header className="dh-help__header">
        <h1 className="dh-help__title">Help</h1>
        <p className="dh-help__lead">
          How DalyHub works, in plain language. If something here does not match
          what you see in the app, the app is right and this page is wrong —
          that is a bug worth fixing.
        </p>
      </header>

      <div className="dh-help__body">
        <nav className="dh-help__contents" aria-label="Help contents">
          {HELP_SECTIONS.map((section) => (
            <div key={section.id} className="dh-help__contents-group">
              <h2 className="dh-help__contents-heading">{section.title}</h2>
              <ul className="dh-help__contents-list">
                {section.topics.map((topic) => (
                  <li key={topic.id}>
                    <a
                      className="dh-help__contents-link"
                      href={`#${topic.id}`}
                      aria-current={
                        topic.id === focusTopicId ? "true" : undefined
                      }
                    >
                      {topic.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="dh-help__topics">
          {HELP_SECTIONS.map((section) => (
            <section
              key={section.id}
              className="dh-help__section"
              aria-labelledby={`${section.id}-heading`}
            >
              <h2
                className="dh-help__section-heading"
                id={`${section.id}-heading`}
              >
                {section.title}
              </h2>
              {section.topics.map((topic) => (
                <HelpTopicPanel
                  key={topic.id}
                  topic={topic}
                  focused={topic.id === focusTopicId}
                />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function HelpTopicPanel({
  topic,
  focused,
}: {
  readonly topic: HelpTopic;
  readonly focused: boolean;
}) {
  return (
    <article
      className="dh-help__topic"
      id={topic.id}
      // A deep-linked topic is marked so it can be tinted AND named to a screen
      // reader — the highlight is never the only signal that this is the one the
      // owner asked for.
      data-focused={focused ? "true" : undefined}
      aria-labelledby={`${topic.id}-heading`}
    >
      <h3 className="dh-help__topic-heading" id={`${topic.id}-heading`}>
        {topic.title}
        {focused ? (
          <span className="dh-visually-hidden"> (the topic you opened)</span>
        ) : null}
      </h3>
      <p className="dh-help__topic-lead">{topic.lead}</p>
      {topic.blocks.map((block, index) => (
        <HelpBlockBody key={index} block={block} />
      ))}
    </article>
  );
}

function HelpBlockBody({ block }: { readonly block: HelpBlock }) {
  if (block.kind === "list") {
    return (
      <ul className="dh-help__list">
        {block.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p className="dh-help__text">{block.text}</p>;
}
