CREATE TABLE companies (
  id INTEGER PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  city VARCHAR(40) NOT NULL
);
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name VARCHAR(80) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  experience INTEGER NOT NULL CHECK (experience >= 0),
  salary DECIMAL(10,2) NOT NULL CHECK (salary >= 7000)
);
