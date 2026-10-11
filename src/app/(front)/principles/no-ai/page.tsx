import type { Metadata } from "next";
import { Aside, FeatureHead, FeaturePage, FeatureSection, Principle, Prose } from "@/components/front/feature/FeaturePage";
import { NO_AI_PATH, TRUST_PROMISES } from "@/components/front/FrontTrust";
import "../../front.css";
import "../../feature.css";

// The authorship principle: the page the landing page's No AI writing card
// (FrontTrust) leads to. The same shell as the feature pages
// (components/front/feature), read as an essay written in a Page: the
// boundary, why Sutura draws it, a statement, what Sutura does instead,
// what the promise means concretely, the closing line. No picture: there
// is no product surface that shows an absence, and the page is strongest
// as type — the prose at the Page's full measure, and two statements set
// on their own. The copy keeps to the product's own promise (CLAUDE.md
// §2): it is about the writer's manuscript and creative work in Sutura,
// and claims nothing beyond that.

const PROMISE = TRUST_PROMISES.find((p) => p.id === "no-ai")!;

export const metadata: Metadata = {
  title: PROMISE.title,
  description: `${PROMISE.line} Why Sutura draws that line, and what it means in practice.`,
  alternates: { canonical: NO_AI_PATH },
};

export default function NoAiPrinciplePage() {
  return (
    <FeaturePage current="no-ai">
      <FeatureHead eyebrow="Authorship" title={PROMISE.title} lede={PROMISE.line} />

      <FeatureSection labelledBy="fp-ai-boundary">
        <Prose>
          <h2 id="fp-ai-boundary">The boundary</h2>
          <p>
            The words in a novel should come from the person whose name is on it. That is the whole of the principle. Everything
            else on this page explains why we hold it and what it means in practice.
          </p>
          <p>
            Sutura is a place to write a book. It is not a tool that writes one with you, for you, or around you. There is no
            button in the editor that produces prose, no suggestion that appears as you type, no option to have a paragraph
            tightened or a scene finished. There will not be one.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-ai-why">
        <Prose>
          <h2 id="fp-ai-why">Why we draw it</h2>
          <p>
            Writing a novel is not the production of text. It is a long sequence of choices, most of them small and many of them
            uncertain: this word rather than that one, a sentence cut, a rhythm kept, a scene that does not work left in place for
            a month because you are not yet sure why. The choosing is the work, and it is also how a writer comes to know what the
            book is.
          </p>
          <p>
            Software that offers to make those choices for you does not save the work; it removes it, and with it the slow
            understanding that only the work produces. A sentence you did not write tells you nothing about your book. A voice that
            is not yours, however fluent, is not a voice you can develop.
          </p>
          <p>
            We also think readers deserve to know that a novel was written by its author. Sutura is built so that a book made in
            it carries that assurance by default.
          </p>
        </Prose>
      </FeatureSection>

      <Principle>The choosing is the work.</Principle>

      <FeatureSection labelledBy="fp-ai-instead">
        <Prose>
          <h2 id="fp-ai-instead">What Sutura does instead</h2>
          <p>
            The environment around the writing is where software can genuinely help, and it is where all of Sutura&rsquo;s effort
            goes.
          </p>
          <ul>
            <li>An ordered manuscript of Groups, Chapters and Scenes, so you always know where the book is.</li>
            <li>A Workspace of Pages, Collections and Canvases for the thinking around it.</li>
            <li>Properties and an Inspector that keep a scene&rsquo;s context beside the writing and out of the text.</li>
            <li>Reliable saving, offline resilience and Scene History, so nothing you write is lost.</li>
            <li>Export to the formats you need, and a project backup you can take anywhere.</li>
          </ul>
          <p>None of this touches your sentences. Each makes it easier to write the next one.</p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-ai-means">
        <Prose>
          <h2 id="fp-ai-means">What &ldquo;no AI writing&rdquo; means, concretely</h2>
          <p>We want the promise to be specific rather than comfortable. Sutura will not:</p>
          <ul>
            <li>generate story prose, at any length, from any prompt;</li>
            <li>rewrite, tighten, expand or &ldquo;improve&rdquo; a passage you wrote;</li>
            <li>complete a scene, a paragraph or a sentence you left unfinished;</li>
            <li>imitate your voice;</li>
            <li>propose replacement text as though it were yours.</li>
          </ul>
          <p>
            The promise concerns your manuscript and your creative work in Sutura: your prose, your notes and your revision notes
            are not sent to an AI service to be written or rewritten. It is a rule of the product, not a setting. The editor has no
            path by which text arrives that you did not type or paste yourself.
          </p>
        </Prose>
      </FeatureSection>

      <Principle>The story is yours to write.</Principle>

      <FeatureSection labelledBy="fp-ai-close">
        <Prose>
          <h2 id="fp-ai-close" className="sr-only">
            In closing
          </h2>
          <p>
            Sutura&rsquo;s job is to make the writing possible, orderly and safe, and then to get out of the way. Software can
            support the work without doing the work for you. The book remains the thing only you can make.
          </p>
          <Aside href="/#features" cue="See how Sutura works">
            The product, from the manuscript out.
          </Aside>
        </Prose>
      </FeatureSection>
    </FeaturePage>
  );
}
