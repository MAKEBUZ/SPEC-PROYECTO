CREATE TABLE publication_pdf_proofs (
  publication_id uuid NOT NULL,
  file_id uuid NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  measurement jsonb NOT NULL CHECK (jsonb_typeof(measurement)='object'),
  PRIMARY KEY(publication_id,file_id),
  FOREIGN KEY(publication_id,file_id) REFERENCES publication_files(publication_id,file_id) ON DELETE CASCADE
);
CREATE TRIGGER publication_pdf_proofs_immutable BEFORE UPDATE ON publication_pdf_proofs FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();
ALTER TABLE stored_files ADD COLUMN pdf_measurement jsonb;
ALTER TABLE stored_files ADD CONSTRAINT pdf_measurement_role CHECK (pdf_measurement IS NULL OR (role='pdf' AND jsonb_typeof(pdf_measurement)='object'));
