-- Up Migration
CREATE TABLE reviewers (
  id           text PRIMARY KEY,
  display_name text NOT NULL
);

CREATE TYPE study_status AS ENUM ('Unassigned', 'InReview', 'Completed');

CREATE TABLE studies (
  id             text PRIMARY KEY,
  modality       text NOT NULL,
  created_at     timestamptz NOT NULL,
  status         study_status NOT NULL DEFAULT 'Unassigned',
  owner_id       text REFERENCES reviewers (id),
  review_note    text,
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  dicom_file_ref text NOT NULL,
  CONSTRAINT owner_matches_status CHECK (
    (status = 'Unassigned' AND owner_id IS NULL) OR
    (status <> 'Unassigned' AND owner_id IS NOT NULL)
  ),
  CONSTRAINT note_matches_status CHECK (
    (status = 'Completed' AND review_note IS NOT NULL
       AND char_length(review_note) BETWEEN 1 AND 1000)
    OR (status <> 'Completed' AND review_note IS NULL)
  )
);

CREATE INDEX studies_order_idx ON studies (created_at, id);
CREATE INDEX studies_filter_idx ON studies (status, modality);

-- Down Migration
DROP TABLE studies;
DROP TYPE study_status;
DROP TABLE reviewers;
